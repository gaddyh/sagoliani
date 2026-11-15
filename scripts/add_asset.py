"""Add a new artwork or vessel photo to the studio.

Prepares the image in public/assets and adds an entry to src/data/catalog.ts.
Run from the project root with the venv from the README:

  Artwork (transparent PNG is kept as-is; a photo/scan on light paper gets its background removed):
    .venv/bin/python scripts/add_asset.py artwork poppies "פרגים" ~/Downloads/poppies.jpg --detail "פרגים אדומים"
    options: --crop L,T,R,B (fractions 0-1)  --rotate 90  --method scan|photo  --scale 1.2

  External test asset (not the artists' work): add --credit-author and --license (+ optional --credit-url, --license-url).
  It is marked external, shown under "נכסי בדיקה חיצוניים" and listed in the credits.

  Vessel (empty piece, photographed from above):
    .venv/bin/python scripts/add_asset.py vessel cream-bowl "קערת שמנת" ~/Downloads/bowl.jpg --detail "שמנת מנוקד"
    options: --mask mask.png (white = decoration area, same photo size)  or  --ellipse CX,CY,RX,RY (fractions of the result)
             --crop L,T,R,B (frame the piece first)  --material light|dark  --fit crop|pad  --curve 0.032  --perspective 0.15

  --update replaces the files of an existing id without touching the catalog (e.g. after a better photo).
  --dry-run only writes a preview to /tmp and prints the catalog entry.
"""
import argparse
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_assets import isolate_scanned_watercolor, isolate_watercolor  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "src" / "data" / "catalog.ts"
VESSEL_SIZE = (1200, 1600)
ARTWORK_MAX = 900


def fractions(text: str, count: int) -> tuple[float, ...]:
    values = tuple(float(value) for value in text.split(","))
    if len(values) != count or not all(0 <= value <= 1 for value in values):
        raise argparse.ArgumentTypeError(f"expected {count} comma-separated fractions between 0 and 1")
    return values


def open_photo(path: Path) -> Image.Image:
    return ImageOps.exif_transpose(Image.open(path))


def fit_vessel(image: Image.Image, mode: str, fill) -> Image.Image:
    if mode != "pad":
        return ImageOps.fit(image, VESSEL_SIZE, Image.Resampling.LANCZOS)
    width, height = VESSEL_SIZE
    scale = min(width / image.width, height / image.height)
    resized = np.asarray(image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS))
    top, left = (height - resized.shape[0]) // 2, (width - resized.shape[1]) // 2
    padding = [(top, height - resized.shape[0] - top), (left, width - resized.shape[1] - left)] + [(0, 0)] * (resized.ndim - 2)
    # Masks pad with black; photos extend their own edge so the background continues without a seam.
    padded = np.pad(resized, padding, mode="constant", constant_values=0) if fill == 0 else np.pad(resized, padding, mode="edge")
    return Image.fromarray(padded)


def crop_fractions(image: Image.Image, crop) -> Image.Image:
    if not crop:
        return image
    left, top, right, bottom = crop
    return image.crop((round(image.width * left), round(image.height * top), round(image.width * right), round(image.height * bottom)))


def prepare_vessel(args) -> tuple[Image.Image, Image.Image, dict]:
    photo = crop_fractions(open_photo(args.image).convert("RGB"), args.crop)
    pixels = np.asarray(photo)
    border = np.concatenate([pixels[0], pixels[-1], pixels[:, 0], pixels[:, -1]])
    background = tuple(int(value) for value in np.median(border, axis=0))
    image = fit_vessel(photo, args.fit, background)
    if args.mask:
        source = open_photo(args.mask).convert("L")
        original = open_photo(args.image)
        if source.size != original.size:
            sys.exit(f"Mask is {source.size[0]}x{source.size[1]} but the photo is {original.width}x{original.height}; they must match.")
        source = crop_fractions(source, args.crop)
        mask = fit_vessel(source, args.fit, 0).point(lambda value: 255 if value > 127 else 0)
    else:
        cx, cy, rx, ry = args.ellipse
        w, h = VESSEL_SIZE
        mask = Image.new("L", VESSEL_SIZE, 0)
        ImageDraw.Draw(mask).ellipse(((cx - rx) * w, (cy - ry) * h, (cx + rx) * w, (cy + ry) * h), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(7))
    inside = np.argwhere(np.asarray(mask) > 127)
    if len(inside) < 1000:
        sys.exit("The decoration area is empty or tiny. Check --mask or --ellipse.")
    (top, left), (bottom, right) = inside.min(axis=0), inside.max(axis=0)
    w, h = VESSEL_SIZE
    cx, cy = (left + right) / 2 / w, (top + bottom) / 2 / h
    radius, half_height = (right - left) / 2 / w, (bottom - top) / 2 / h
    placements = {
        "center": (cx, cy, radius * .85),
        "small": (cx, cy, radius * .63),
        "offset": (cx + radius * .15, cy - half_height * .12, radius * .75),
    }
    return image, mask, placements


def prepare_artwork(args) -> Image.Image:
    image = crop_fractions(open_photo(args.image), args.crop)
    if args.rotate:
        image = image.rotate(args.rotate, expand=True)
    image.thumbnail((ARTWORK_MAX, ARTWORK_MAX), Image.Resampling.LANCZOS)
    if image.mode in ("RGBA", "LA", "P") and np.asarray(image.convert("RGBA"))[:, :, 3].mean() < 250:
        print("Keeping the existing transparency.")
        return image.convert("RGBA")
    print(f"Removing the paper background ({args.method}). Compare the result with the original.")
    return (isolate_scanned_watercolor if args.method == "scan" else isolate_watercolor)(image.convert("RGB"))


def ts(text: str) -> str:
    return "'" + text.replace("\\", "\\\\").replace("'", "\\'") + "'"


def credit_lines(args) -> str:
    if not args.credit_author:
        return ""
    return (
        "    external: true,\n"
        "    credit: {\n"
        f"      author: {ts(args.credit_author)},\n"
        f"      sourceUrl: {ts(args.credit_url or '')},\n"
        f"      license: {ts(args.license)},\n"
        f"      licenseUrl: {ts(args.license_url or '')},\n"
        "    },\n"
    )


def vessel_entry(args, placements: dict) -> str:
    rows = "\n".join(f"      {name}: {{ x: {x:.3f}, y: {y:.3f}, width: {width:.3f} }}," for name, (x, y, width) in placements.items())
    return (
        "  {\n"
        f"    id: {ts(args.id)}, name: {ts(args.name)}, detail: {ts(args.detail)},\n"
        f"    image: '/assets/vessels/{args.id}.webp', mask: '/assets/vessels/{args.id}-mask.png',\n"
        f"    material: {ts(args.material)}, curve: {args.curve}, perspective: {args.perspective},\n"
        "    placements: {\n"
        f"{rows}\n"
        "    },\n"
        f"{credit_lines(args)}"
        "  },\n"
    )


def artwork_entry(args) -> str:
    scale = f", scale: {args.scale}" if args.scale else ""
    return (
        "  {\n"
        f"    id: {ts(args.id)}, name: {ts(args.name)}, detail: {ts(args.detail)},\n"
        f"    image: '/assets/artwork/{args.id}.png', source: {ts(args.source)}{scale},\n"
        f"{credit_lines(args)}"
        "  },\n"
    )


def add_to_catalog(kind: str, asset_id: str, entry: str) -> None:
    text = CATALOG.read_text(encoding="utf-8")
    type_name, array_name = ("VesselId", "vessels") if kind == "vessel" else ("ArtworkId", "artworks")
    type_line = re.search(rf"^export type {type_name} = (.+)$", text, re.M)
    array_start = text.find(f"export const {array_name}")
    array_end = text.find("\n]\n", array_start)
    if not type_line or array_start < 0 or array_end < 0:
        sys.exit("Could not find where to add the entry in src/data/catalog.ts; add it by hand.")
    text = text[:array_end + 1] + entry + text[array_end + 1:]
    text = text[:type_line.start(1)] + f"{type_line.group(1)} | '{asset_id}'" + text[type_line.end(1):]
    CATALOG.write_text(text, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("kind", choices=["artwork", "vessel"])
    parser.add_argument("id", help="short English id, e.g. cream-bowl (lowercase letters, digits, dashes)")
    parser.add_argument("name", help="Hebrew display name")
    parser.add_argument("image", type=Path)
    parser.add_argument("--detail", default="")
    parser.add_argument("--update", action="store_true", help="replace the files of an existing id")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--crop", type=lambda text: fractions(text, 4))
    parser.add_argument("--rotate", type=int, default=0)
    parser.add_argument("--method", choices=["scan", "photo"], default="scan")
    parser.add_argument("--scale", type=float)
    parser.add_argument("--source", default="ציור מקורי של היוצרות")
    parser.add_argument("--mask", type=Path)
    parser.add_argument("--ellipse", type=lambda text: fractions(text, 4), default=(.5, .55, .3, .2))
    parser.add_argument("--material", choices=["light", "dark"], default="light")
    parser.add_argument("--fit", choices=["crop", "pad"], default="crop")
    parser.add_argument("--curve", type=float, default=.032)
    parser.add_argument("--perspective", type=float, default=.15)
    parser.add_argument("--credit-author", help="external asset: who made the photo/artwork and where from")
    parser.add_argument("--credit-url", help="external asset: page of the original file (optional)")
    parser.add_argument("--license", help="external asset: license name, e.g. 'Pexels License'")
    parser.add_argument("--license-url", help="external asset: link to the license (optional)")
    args = parser.parse_args()
    if args.credit_author and not args.license:
        sys.exit("--credit-author needs --license too (for an AI image, e.g. --license 'תמונה שנוצרה ב-AI').")

    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", args.id):
        sys.exit("id must be lowercase English letters, digits and dashes, e.g. cream-bowl")
    if not args.image.is_file():
        sys.exit(f"Image not found: {args.image}")
    exists = re.search(rf"id: '{re.escape(args.id)}'", CATALOG.read_text(encoding="utf-8")) is not None
    if exists and not args.update:
        sys.exit(f"'{args.id}' is already in the catalog. Use --update to replace its files, or pick another id.")
    if args.update and not exists:
        sys.exit(f"'{args.id}' is not in the catalog yet; run without --update.")

    out = Path("/tmp") if args.dry_run else ROOT / "public" / "assets" / ("vessels" if args.kind == "vessel" else "artwork")
    if args.kind == "vessel":
        image, mask, placements = prepare_vessel(args)
        image.save(out / f"{args.id}.webp", "WEBP", quality=91)
        mask.save(out / f"{args.id}-mask.png", optimize=True)
        preview = Image.composite(Image.new("RGB", VESSEL_SIZE, (237, 155, 109)), image, mask.point(lambda value: value * 45 // 100))
        preview.save(Path("/tmp") / f"{args.id}-area-preview.jpg", quality=85)
        entry = vessel_entry(args, placements)
        written = [out / f"{args.id}.webp", out / f"{args.id}-mask.png"]
        print(f"Decoration area preview: /tmp/{args.id}-area-preview.jpg")
    else:
        prepare_artwork(args).save(out / f"{args.id}.png", optimize=True)
        entry = artwork_entry(args)
        written = [out / f"{args.id}.png"]

    for path in written:
        print(f"Wrote {path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}")
    if args.dry_run:
        print("Dry run: catalog not changed. Entry would be:\n" + entry)
    elif args.update:
        print("Files replaced; catalog unchanged.")
    else:
        add_to_catalog(args.kind, args.id, entry)
        print(f"Added '{args.id}' to src/data/catalog.ts. Check it in the studio (npm run dev), then commit and push.")


if __name__ == "__main__":
    main()
