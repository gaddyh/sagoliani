"""Prepare local photographs, vessel masks and transparent watercolor crops.

Run from the project root with: .venv/bin/python scripts/prepare_assets.py
The originals are never modified. Crops and masks are intentional, reproducible POC choices.
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "assets"
VESSELS = OUTPUT / "vessels"
ARTWORK = OUTPUT / "artwork"

# The two original bowl photos (turquoise, deep blue) were removed from the studio; their masks are in git history.
BOWLS: dict = {}

EXTERNAL_BOWLS: dict = {}  # external test vessels are now added with scripts/add_asset.py

EXTERNAL_ART_CROPS = {
    "monkey-flower": {"file": "monkey-flower.jpg", "crop": (.025, .085, .93, .955)},
    "gentian": {"file": "gentian.jpg", "crop": (.20, .35, .78, .895)},
    "poppy": {"file": "poppy.jpg", "crop": (.025, .035, .95, .91)},
}

ART_CROPS = {
    "meadow": {
        "file": "WhatsApp Image 2026-11-15 at 00.17.53.jpeg",
        "crop": (.035, .012, .95, .405),
        "rotate": 90,
    },
    "spring": {
        "file": "WhatsApp Image 2026-11-15 at 00.17.53.jpeg",
        "crop": (.035, .535, .96, .885),
        "rotate": 90,
    },
    "garden": {
        "file": "WhatsApp Image 2026-11-15 at 00.17.53.jpeg",
        "crop": (.32, .25, .96, .64),
        "rotate": 90,
    },
    "wildflowers": {
        "file": "WhatsApp Image 2026-11-15 at 00.17.53 (1).jpeg",
        "crop": (.36, .185, .815, .49),
        "rotate": 0,
    },
}


def isolate_watercolor(image: Image.Image) -> Image.Image:
    """Soft photographic paper key, not a claim to recover invisible white pigment."""
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    blur = cv2.GaussianBlur(rgb, (3, 3), .7)
    maximum = np.max(blur, axis=2)
    minimum = np.min(blur, axis=2)
    chroma = (maximum - minimum) / np.maximum(maximum, 1)
    luminance = .2126 * blur[:, :, 0] + .7152 * blur[:, :, 1] + .0722 * blur[:, :, 2]
    color = np.clip((chroma - .10) / .25, 0, 1)
    ink = np.clip((226 - luminance) / 120, 0, 1) * np.clip((chroma - .075) / .2, 0, 1)
    alpha = np.maximum(color, ink * .8)
    alpha = np.clip((alpha - .065) / .9, 0, 1)

    h, w = alpha.shape
    x = np.minimum(np.arange(w), np.arange(w)[::-1]) / max(w * .055, 1)
    y = np.minimum(np.arange(h), np.arange(h)[::-1]) / max(h * .055, 1)
    alpha *= np.minimum(np.minimum(x[None, :], y[:, None]), 1)
    alpha = cv2.GaussianBlur(alpha, (3, 3), .55)

    paper = np.array([247, 246, 241], dtype=np.float32)
    clean = (rgb - (1 - alpha[:, :, None]) * paper) / np.maximum(alpha[:, :, None], .18)
    clean = np.clip(clean, 0, 255).astype(np.uint8)
    result = np.dstack((clean, (alpha * 255).astype(np.uint8)))
    return Image.fromarray(result)


def prepare_external_vessel(name: str, config: dict) -> None:
    source = Image.open(ROOT / "assets-source" / "external" / config["file"]).convert("RGB")
    source.thumbnail((1200, 1600), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (1200, 1600), (232, 228, 218) if name == "white-study" else (59, 48, 39))
    canvas.paste(source, ((1200 - source.width) // 2, (1600 - source.height) // 2))
    canvas.save(VESSELS / f"{name}.webp", "WEBP", quality=90)
    mask = Image.new("L", canvas.size, 0)
    cx, cy = config["center"]
    rx, ry = config["radius"]
    ImageDraw.Draw(mask).ellipse(((cx - rx) * 1200, (cy - ry) * 1600, (cx + rx) * 1200, (cy + ry) * 1600), fill=255)
    mask.filter(ImageFilter.GaussianBlur(6)).save(VESSELS / f"{name}-mask.png", optimize=True)


def isolate_scanned_watercolor(image: Image.Image) -> Image.Image:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    h, w, _ = rgb.shape
    patch = max(12, round(min(h, w) * .07))
    corners = [np.median(rgb[y:y + patch, x:x + patch], axis=(0, 1)) for y in (0, h - patch) for x in (0, w - patch)]
    yy = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    xx = np.linspace(0, 1, w, dtype=np.float32)[None, :, None]
    background = ((1 - yy) * ((1 - xx) * corners[0] + xx * corners[1])
                  + yy * ((1 - xx) * corners[2] + xx * corners[3]))
    softened = cv2.GaussianBlur(rgb, (3, 3), .65)
    difference = np.sqrt(np.mean((softened - background) ** 2, axis=2))
    alpha = np.clip((difference - 12) / 85, 0, 1) ** .85
    x = np.minimum(np.arange(w), np.arange(w)[::-1]) / max(w * .035, 1)
    y = np.minimum(np.arange(h), np.arange(h)[::-1]) / max(h * .035, 1)
    alpha *= np.minimum(np.minimum(x[None, :], y[:, None]), 1)
    alpha = cv2.GaussianBlur(alpha, (3, 3), .55)
    pigment = (rgb - (1 - alpha[:, :, None]) * background) / np.maximum(alpha[:, :, None], .20)
    result = np.dstack((np.clip(pigment, 0, 255).astype(np.uint8), (alpha * 255).astype(np.uint8)))
    return Image.fromarray(result)


def main() -> None:
    VESSELS.mkdir(parents=True, exist_ok=True)
    ARTWORK.mkdir(parents=True, exist_ok=True)
    for name, config in BOWLS.items():
        image = Image.open(ROOT / config["file"]).convert("RGB")
        image.save(VESSELS / f"{name}.webp", "WEBP", quality=91)
        width, height = image.size
        mask = Image.new("L", image.size, 0)
        polygon = [(round(x * width), round(y * height)) for x, y in config["surface"]]
        ImageDraw.Draw(mask).polygon(polygon, fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(radius=7))
        mask.save(VESSELS / f"{name}-mask.png", optimize=True)
    for name, config in ART_CROPS.items():
        image = Image.open(ROOT / config["file"]).convert("RGB")
        width, height = image.size
        left, top, right, bottom = config["crop"]
        image = image.crop((round(width * left), round(height * top), round(width * right), round(height * bottom)))
        if config["rotate"]:
            image = image.rotate(config["rotate"], expand=True)
        image.thumbnail((900, 900), Image.Resampling.LANCZOS)
        isolate_watercolor(image).save(ARTWORK / f"{name}.png", optimize=True)
    for name, config in EXTERNAL_BOWLS.items():
        if (ROOT / "assets-source" / "external" / config["file"]).exists():
            prepare_external_vessel(name, config)
    for name, config in EXTERNAL_ART_CROPS.items():
        source = ROOT / "assets-source" / "external" / config["file"]
        if not source.exists():
            continue
        image = Image.open(source).convert("RGB")
        width, height = image.size
        left, top, right, bottom = config["crop"]
        image = image.crop((round(width * left), round(height * top), round(width * right), round(height * bottom)))
        image.thumbnail((900, 900), Image.Resampling.LANCZOS)
        isolate_scanned_watercolor(image).save(ARTWORK / f"{name}.png", optimize=True)
    print("Prepared local vessels and artwork; external test assets are included when downloaded")


if __name__ == "__main__":
    main()
