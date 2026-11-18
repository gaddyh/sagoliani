"""Regenerate vessel decoration masks to cover the whole visible vessel.

The original masks were small center ellipses (the flat opening of the bowl).
Real finished pieces are painted across the whole visible surface — rim, inner
wall and the visible side — so the masks are rebuilt from each vessel photo's
silhouette (GrabCut), inset slightly and softened, matching the pipeline used
to compute the original ellipses.

Run from the project root with the venv from the README:

  .venv/bin/python scripts/widen_masks.py
"""
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
VESSELS = ROOT / "public" / "assets" / "vessels"
CANVAS = (1200, 1600)


def silhouette(image: np.ndarray) -> np.ndarray:
    h, w = image.shape[:2]
    gc = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
    b = round(min(h, w) * 0.12)
    bg = np.zeros((h, w), np.uint8)
    cv2.rectangle(bg, (b, b), (w - b, h - b), 1, -1)
    gc[bg == 0] = cv2.GC_BGD
    f = round(min(h, w) * 0.16)
    cv2.rectangle(gc, (f, f), (w - f, h - f), cv2.GC_FGD, -1)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(image, gc, None, bgd, fgd, 5, cv2.GC_INIT_WITH_MASK)
    fg = np.where((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD), 1, 0).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
    if count < 2:
        sys.exit(f"No silhouette found; vessel photos must show the piece on a plain background.")
    return (labels == (1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA])))).astype(np.uint8)


def main() -> None:
    import json
    import re

    catalog = (ROOT / "src" / "data" / "catalog.ts").read_text(encoding="utf-8")
    array_start = catalog.find("export const vessels")
    array_end = catalog.find("\n]\n", array_start)
    vessels_block = catalog[array_start:array_end]
    vessel_ids = re.findall(r"id: '([a-z0-9-]+)'", vessels_block)
    report = {}
    for vessel_id in sorted(vessel_ids):
        photo = cv2.imread(str(VESSELS / f"{vessel_id}.webp"))
        if photo is None:
            sys.exit(f"Missing vessel photo for {vessel_id}")
        blob = silhouette(photo)
        # Keep a small inset from the detected edge so paint never spills onto the table,
        # then soften like the original masks.
        inset = cv2.erode(blob, np.ones((15, 15), np.uint8))
        mask = cv2.GaussianBlur((inset * 255).astype(np.uint8), (0, 0), 7)
        cv2.imwrite(str(VESSELS / f"{vessel_id}-mask.png"), mask)
        ys, xs = np.nonzero(blob)
        width_px = xs.max() - xs.min() + 1
        entry = re.search(rf"width: ([\d.]+) \}}", vessels_block[vessels_block.find(f"id: '{vessel_id}'"):][:400])
        needed = round(width_px / (float(entry.group(1)) * 1200) * 100) if entry else 0
        report[vessel_id] = {"silhouette_width_px": int(width_px), "size_pct_for_full_coverage": needed}
        print(f"{vessel_id}: silhouette {width_px}px wide, full coverage needs ~{needed}% size")
    print("\nMax needed:", max(item["size_pct_for_full_coverage"] for item in report.values()))
    (ROOT / "validation" / "mask-widening.json").write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
