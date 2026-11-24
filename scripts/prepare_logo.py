"""Blend the logo photo's paper background into the site cream.

Run from the project root with: .venv/bin/python scripts/prepare_logo.py
The original JPEG is never modified; only public/assets/logo.webp is written.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "logo4.jpeg"
TARGET = ROOT / "public" / "assets" / "logo.webp"

SITE_CREAM = np.array([242, 234, 223], dtype=np.float32)  # --cream in styles.css


def blend_paper_to_cream(image: Image.Image) -> Image.Image:
    """Recolor near-white paper to the site cream with a soft alpha ramp.

    Background weight falls off with distance from the paper white, so JPEG
    noise and halos blend smoothly while ink and washes stay untouched.
    """
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    patch = 24
    corners = [rgb[y:y + patch, x:x + patch].reshape(-1, 3).mean(axis=0)
               for y in (0, rgb.shape[0] - patch) for x in (0, rgb.shape[1] - patch)]
    paper = np.median(np.stack(corners), axis=0)
    deviation = np.max(np.abs(rgb - paper), axis=2)
    alpha = np.clip((16 - deviation) / (16 - 4), 0, 1)
    blended = rgb * (1 - alpha[:, :, None]) + SITE_CREAM * alpha[:, :, None]
    return Image.fromarray(np.clip(blended, 0, 255).astype(np.uint8))


def main() -> None:
    logo = Image.open(SOURCE)
    blend_paper_to_cream(logo).save(TARGET, "WEBP", quality=90)
    print(f"Blended {SOURCE.name} paper background to site cream -> {TARGET.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
