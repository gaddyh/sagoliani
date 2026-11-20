"""Import finished-product photos from a source folder into the shop catalog.

Converts the listed photos to WebP under public/assets/products/<product-id>/<material>/
and appends one finishedVariants record to src/data/products.ts. Only the listed
photos are imported; other files in the folder stay untouched.

Run from the project root with the venv:

  .venv/bin/python scripts/import_product_photos.py <product-id> <material> <artwork-id> "שם האיור" <source-folder> <photo-1> [photo-2 ...]

Photos are imported in the given order; the first photo is the variant's primary
image (gallery card and cart thumbnail). The source folder keeps its original
files and names. Example:

  .venv/bin/python scripts/import_product_photos.py shay-bowl smooth purple-embrace "חיבוק סגול" \
    "assets-source/products/שי חיבוק סגול חלק" "קערה קרמית עם פרחי לבנדר.png" "קערה 2.png"

  --dry-run  print the plan (files, outputs, catalog record) without writing anything
  --update   replace an existing variant record and regenerate its images
"""
import argparse
import re
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
PRODUCTS = ROOT / "src" / "data" / "products.ts"
MAX_EDGE = 1600
QUALITY = 88


def ts(text: str) -> str:
    return "'" + text.replace("\\", "\\\\").replace("'", "\\'") + "'"


def load_products_text() -> str:
    return PRODUCTS.read_text(encoding="utf-8")


def product_exists(text: str, product_id: str) -> bool:
    array_start = text.find("export const products")
    array_end = text.find("\n]\n", array_start)
    if array_start < 0 or array_end < 0:
        sys.exit("Could not find the products array in src/data/products.ts.")
    return re.search(rf"id: {ts(product_id)}[,\s]", text[array_start:array_end]) is not None


def variant_exists(text: str, variant_id: str) -> bool:
    array_start = text.find("export const finishedVariants")
    array_end = text.find("\n]\n", array_start)
    if array_start < 0 or array_end < 0:
        sys.exit("Could not find the finishedVariants array in src/data/products.ts.")
    return re.search(rf"id: {ts(variant_id)}[,\s]", text[array_start:array_end]) is not None


def output_names(artwork_id: str, count: int) -> list[str]:
    if count == 1:
        return [f"{artwork_id}.webp"]
    return [f"{artwork_id}-{index:02d}.webp" for index in range(1, count + 1)]


def to_webp(source: Path) -> Image.Image:
    image = ImageOps.exif_transpose(Image.open(source))
    if image.mode in ("RGBA", "LA", "P"):
        image = image.convert("RGBA")
        background = Image.new("RGBA", image.size, (255, 255, 255, 255))
        image = Image.alpha_composite(background, image)
    image = image.convert("RGB")
    image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
    return image


def record_line(product_id: str, material: str, artwork_id: str, artwork_name: str, images: list[str]) -> str:
    paths = ", ".join(ts(f"/assets/products/{product_id}/{material}/{name}") for name in images)
    return (
        "  {"
        f" id: {ts(f'{product_id}-{material}-{artwork_id}')},"
        f" productId: {ts(product_id)},"
        f" material: {ts(material)},"
        f" artworkId: {ts(artwork_id)},"
        f" artworkName: {ts(artwork_name)},"
        f" images: [{paths}]"
        " },\n"
    )


def insert_record(entry: str) -> None:
    text = load_products_text()
    array_start = text.find("export const finishedVariants")
    array_end = text.find("\n]\n", array_start)
    if array_start < 0 or array_end < 0:
        sys.exit("Could not find the finishedVariants array in src/data/products.ts.")
    text = text[:array_end + 1] + entry + text[array_end + 1:]
    PRODUCTS.write_text(text, encoding="utf-8")


def replace_record(variant_id: str, entry: str) -> None:
    text = load_products_text()
    pattern = re.compile(rf"^  \{{ id: {ts(variant_id)}, .*$", re.M)
    if not pattern.search(text):
        sys.exit(f"Variant {variant_id} was not found in src/data/products.ts.")
    PRODUCTS.write_text(pattern.sub(entry.rstrip("\n"), text, count=1), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("product_id", help="existing product id from src/data/products.ts, e.g. shay-bowl")
    parser.add_argument("material", choices=["smooth", "speckled"])
    parser.add_argument("artwork_id", help="stable artwork slug, e.g. purple-embrace (lowercase, dashes)")
    parser.add_argument("artwork_name", help="Hebrew artwork name shown in the shop, e.g. חיבוק סגול")
    parser.add_argument("source", type=Path, help="source folder with the original photos")
    parser.add_argument("photos", nargs="+", help="photo filenames inside the source folder, in order (first = primary)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--update", action="store_true", help="replace an existing variant record and its images")
    args = parser.parse_args()

    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", args.artwork_id):
        sys.exit("artwork-id must be lowercase letters, digits and dashes.")
    text = load_products_text()
    if not product_exists(text, args.product_id):
        sys.exit(f"Product '{args.product_id}' does not exist in src/data/products.ts. Add it (and its ProductId entry) first.")
    variant_id = f"{args.product_id}-{args.material}-{args.artwork_id}"
    if variant_exists(text, variant_id) and not args.update:
        sys.exit(f"Variant '{variant_id}' already exists; pass --update to replace it.")

    source = args.source if args.source.is_absolute() else ROOT / args.source
    if not source.is_dir():
        sys.exit(f"Source folder {source} does not exist.")
    files: list[Path] = []
    for name in args.photos:
        path = source / name
        if not path.is_file():
            sys.exit(f"Photo {path} does not exist.")
        if path.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
            sys.exit(f"Unsupported photo type: {path}")
        files.append(path)

    names = output_names(args.artwork_id, len(files))
    targets = [ROOT / "public" / "assets" / "products" / args.product_id / args.material / name for name in names]
    for target in targets:
        if target.exists() and not args.update:
            sys.exit(f"{target} already exists; pass --update to overwrite.")

    entry = record_line(args.product_id, args.material, args.artwork_id, args.artwork_name, names)
    print(f"Variant: {variant_id}")
    for path, target in zip(files, targets):
        print(f"  {path.relative_to(ROOT)} -> {target.relative_to(ROOT)}")
    print(f"Record to add to finishedVariants:\n{entry}")
    if args.dry_run:
        print("Dry run: nothing written.")
        return

    for path, target in zip(files, targets):
        target.parent.mkdir(parents=True, exist_ok=True)
        to_webp(path).save(target, "WEBP", quality=QUALITY)
        print(f"Wrote {target.relative_to(ROOT)}")
    if args.update and variant_exists(load_products_text(), variant_id):
        replace_record(variant_id, entry)
        print(f"Replaced the record for {variant_id} in src/data/products.ts.")
    else:
        insert_record(entry)
        print(f"Added the record for {variant_id} to src/data/products.ts.")


if __name__ == "__main__":
    main()
