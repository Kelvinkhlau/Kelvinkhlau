#!/usr/bin/env python3
"""
Generate placeholder PWA icons for life-os.

用途：
    掃走 frontend/public/icons/ 入面嘅 .gitkeep，用 PIL 畫個簡單嘅
    深色底 + 白色 "L" icon 出 192/512/maskable/apple-touch/favicon。
    之後想換靚啲嘅 icon，改呢個 script 或者直接覆蓋 PNG file 都得。

依賴：
    python3 -m pip install --user pillow

用法：
    python3 scripts/gen-icons.py
"""
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "public" / "icons"

BG = (10, 10, 10, 255)        # zinc-950
CARD = (24, 24, 27, 255)       # zinc-900
FG = (250, 250, 250, 255)      # zinc-50
ACCENT = (59, 130, 246, 255)   # blue-500


def make_icon(size: int, path: Path, *, maskable: bool = False) -> None:
    img = Image.new("RGBA", (size, size), BG)
    d = ImageDraw.Draw(img)

    # Maskable icons need ≥10% safe area — use 14% to be comfortable
    pad = int(size * (0.14 if maskable else 0.08))
    inner = size - 2 * pad

    # Rounded card
    radius = int(inner * 0.18)
    d.rounded_rectangle(
        [(pad, pad), (pad + inner, pad + inner)],
        radius=radius,
        fill=CARD,
        outline=ACCENT,
        width=max(2, size // 128),
    )

    # Draw "L" geometrically (font-free)
    lw = int(inner * 0.12)
    l_h = int(inner * 0.58)
    l_w = int(inner * 0.40)
    cx = pad + inner // 2
    cy = pad + inner // 2 + int(inner * 0.04)
    top = cy - l_h // 2
    bot = cy + l_h // 2
    left = cx - l_w // 2

    d.rectangle([(left, top), (left + lw, bot)], fill=FG)
    d.rectangle([(left, bot - lw), (left + l_w, bot)], fill=FG)

    # Small accent dot
    dot_r = max(2, int(inner * 0.04))
    dot_cx = left + l_w
    dot_cy = top + int(inner * 0.02)
    d.ellipse(
        [(dot_cx - dot_r, dot_cy - dot_r), (dot_cx + dot_r, dot_cy + dot_r)],
        fill=ACCENT,
    )

    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)
    print(f"  ✓ {path.relative_to(ROOT)} ({size}x{size})")


def main() -> None:
    print(f"→ Generating icons in {OUT.relative_to(ROOT)}/")
    targets = [
        (192, "icon-192.png", False),
        (512, "icon-512.png", False),
        (512, "icon-maskable-512.png", True),
        (180, "apple-touch-icon.png", False),
        (32, "favicon-32.png", False),
        (16, "favicon-16.png", False),
    ]
    for size, name, maskable in targets:
        make_icon(size, OUT / name, maskable=maskable)
    print("✓ done")


if __name__ == "__main__":
    main()
