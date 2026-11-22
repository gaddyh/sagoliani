"""Import gallery artwork photos from the source folder into the public gallery.

Converts every photo in the source folder to WebP under public/assets/gallery/
as gallery-NN.webp (NN follows the source folder's alphabetical order),
applying EXIF orientation, flattening transparency onto white and capping the
long edge at 1600px. The source folder keeps its original files and names.

Run from the project root with the venv:

  .venv/bin/python scripts/import_gallery.py [source-folder]

The default source folder is the batch supplied by the artists
(assets-source/נישאים ברוח). After adding or replacing photos, re-run the
script and update the galleryImages list in src/data/gallery.ts to match.

  --dry-run  print the plan without writing anything
"""
import argparse
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "assets-source" / "נישאים ברוח"
OUTPUT = ROOT / "public" / "assets" / "gallery"
SUPPORTED = (".png", ".jpg", ".jpeg", ".webp")
MAX_EDGE = 1600
QUALITY = 88


def to_webp(source: Path) -> Image.Image:
    image = ImageOps.exif_transpose(Image.open(source))
    if image.mode in ("RGBA", "LA", "P"):
        image = image.convert("RGBA")
        background = Image.new("RGBA", image.size, (255, 255, 255, 255))
        image = Image.alpha_composite(background, image)
    image = image.convert("RGB")
    image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
    return image


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", nargs="?", type=Path, default=DEFAULT_SOURCE, help="source folder with the original photos")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    source = args.source if args.source.is_absolute() else ROOT / args.source
    if not source.is_dir():
        sys.exit(f"Source folder {source} does not exist.")
    files = sorted(path for path in source.iterdir() if path.is_file() and path.suffix.lower() in SUPPORTED)
    if not files:
        sys.exit(f"No photos found in {source}.")

    targets = [OUTPUT / f"gallery-{index:02d}.webp" for index in range(1, len(files) + 1)]
    for path, target in zip(files, targets):
        print(f"  {path.relative_to(ROOT)} -> {target.relative_to(ROOT)}")
    if args.dry_run:
        print("Dry run: nothing written.")
        return

    OUTPUT.mkdir(parents=True, exist_ok=True)
    for path, target in zip(files, targets):
        to_webp(path).save(target, "WEBP", quality=QUALITY)
        print(f"Wrote {target.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
