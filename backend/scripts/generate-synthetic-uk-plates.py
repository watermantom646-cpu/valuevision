#!/usr/bin/env python3
"""
Generate synthetic UK-style number plate images for cheap scanner-only benchmarking.

Output:
- images under backend/data/synthetic-uk-plates/
- manifest JSON at backend/data/uk-plate-scan-benchmark.json
"""

from __future__ import annotations

import argparse
import json
import random
import string
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


LETTERS = "ABCDEFGHJKLMNOPRSTUVWXYZ"


def random_plate(rng: random.Random) -> str:
    return (
        rng.choice(LETTERS)
        + rng.choice(LETTERS)
        + str(rng.randint(0, 9))
        + str(rng.randint(0, 9))
        + rng.choice(LETTERS)
        + rng.choice(LETTERS)
        + rng.choice(LETTERS)
    )


def pick_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/Library/Fonts/Arial.ttf",
    ]
    for p in candidates:
        try:
            return ImageFont.truetype(p, size=size)
        except Exception:
            pass
    return ImageFont.load_default()


def draw_plate_image(plate: str, rng: random.Random) -> Image.Image:
    canvas_w, canvas_h = 700, 260
    plate_w, plate_h = 560, 130
    bg = Image.new("RGB", (canvas_w, canvas_h), (35, 38, 42))
    plate_img = Image.new("RGB", (plate_w, plate_h), (255, 214, 54))
    pdraw = ImageDraw.Draw(plate_img)

    border = 6
    pdraw.rectangle(
        [border, border, plate_w - border, plate_h - border],
        outline=(10, 10, 10),
        width=5,
    )

    # Add small amount of dirt/noise on plate surface.
    for _ in range(240):
        x = rng.randint(0, plate_w - 1)
        y = rng.randint(0, plate_h - 1)
        shade = rng.randint(170, 255)
        plate_img.putpixel((x, y), (shade, shade, max(0, shade - rng.randint(0, 35))))

    display_text = f"{plate[:4]} {plate[4:]}"
    font = pick_font(84)
    text_bbox = pdraw.textbbox((0, 0), display_text, font=font)
    text_w = text_bbox[2] - text_bbox[0]
    text_h = text_bbox[3] - text_bbox[1]
    tx = (plate_w - text_w) // 2
    ty = (plate_h - text_h) // 2 - 4
    pdraw.text((tx, ty), display_text, fill=(0, 0, 0), font=font)

    ox = (canvas_w - plate_w) // 2 + rng.randint(-25, 25)
    oy = (canvas_h - plate_h) // 2 + rng.randint(-18, 18)
    bg.paste(plate_img, (ox, oy))

    angle = rng.uniform(-5.0, 5.0)
    out = bg.rotate(angle, resample=Image.Resampling.BICUBIC, expand=False, fillcolor=(30, 30, 34))

    if rng.random() < 0.6:
        blur_radius = rng.uniform(0.2, 1.2)
        out = out.filter(ImageFilter.GaussianBlur(blur_radius))

    # Add mild sensor-style noise.
    px = out.load()
    for _ in range(2800):
        x = rng.randint(0, canvas_w - 1)
        y = rng.randint(0, canvas_h - 1)
        r, g, b = px[x, y]
        delta = rng.randint(-16, 16)
        px[x, y] = (
            max(0, min(255, r + delta)),
            max(0, min(255, g + delta)),
            max(0, min(255, b + delta)),
        )

    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=20260505)
    parser.add_argument("--output-dir", default="./data/synthetic-uk-plates")
    parser.add_argument("--manifest", default="./data/uk-plate-scan-benchmark.json")
    args = parser.parse_args()

    count = max(1, int(args.count))
    rng = random.Random(int(args.seed))

    root = Path(__file__).resolve().parents[1]
    out_dir = (root / args.output_dir).resolve()
    manifest_path = (root / args.manifest).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)

    rows: list[dict[str, str]] = []
    seen: set[str] = set()
    for i in range(count):
        plate = random_plate(rng)
        while plate in seen:
            plate = random_plate(rng)
        seen.add(plate)

        img = draw_plate_image(plate, rng)
        file_name = f"{plate}_{i:04d}.png"
        out_path = out_dir / file_name
        img.save(out_path, format="PNG")

        rows.append(
            {
                "registrationNumber": plate,
                "imagePath": str(out_path),
            }
        )

    manifest_path.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(f"Generated {len(rows)} synthetic plates.")
    print(f"Images: {out_dir}")
    print(f"Manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

