"""Crop catalog illustration photos from the supplied brochure pages.

Run from the project root with: .venv/bin/python scripts/prepare_brochure.py
These are POC placeholders until the artists supply original photographs.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "assets" / "brochure"
PAGE_A = "WhatsApp Image 2026-11-15 at 00.14.50.jpeg"
PAGE_B = "WhatsApp Image 2026-11-15 at 00.14.50 (1).jpeg"

CROPS = {
    "hero": (PAGE_A, (.662, .220, .997, .998)),
    "round-platter": (PAGE_A, (.340, .372, .640, .576)),
    "deep-bowl": (PAGE_A, (.338, .650, .482, .850)),
    "flat-bowl": (PAGE_A, (.498, .650, .643, .850)),
    "sprig": (PAGE_A, (.060, .025, .240, .515)),
    "artists": (PAGE_A, (.068, .655, .242, .888)),
    "cake-pan": (PAGE_B, (.683, .174, .980, .455)),
    "speckled-platter": (PAGE_B, (.818, .535, .980, .734)),
    "vase": (PAGE_B, (.683, .647, .806, .846)),
    "english-platter": (PAGE_B, (.355, .320, .641, .632)),
    "river-stones": (PAGE_B, (.025, .320, .312, .655)),
}


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, (page, (left, top, right, bottom)) in CROPS.items():
        image = Image.open(ROOT / page).convert("RGB")
        w, h = image.size
        crop = image.crop((round(w * left), round(h * top), round(w * right), round(h * bottom)))
        crop.save(OUTPUT / f"{name}.webp", "WEBP", quality=88)
    cover = Image.open(ROOT / PAGE_A).convert("RGB")
    w, h = cover.size
    share = cover.crop((0, 0, w, round(w * 630 / 1200))).resize((1200, 630), Image.Resampling.LANCZOS)
    share.save(ROOT / "public" / "og-image.jpg", "JPEG", quality=85, optimize=True)
    print(f"Prepared {len(CROPS)} brochure crops in {OUTPUT.relative_to(ROOT)} and public/og-image.jpg")


if __name__ == "__main__":
    main()
