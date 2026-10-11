#!/usr/bin/env python3
"""Shrink a screenshot so it can be displayed inline in chat.

Chat images are sent as inline base64 JSON, and the transport truncates large
payloads (the JSON carries the image twice: `base64` + `dataUri`). A PNG above
roughly 10 KB therefore arrives truncated and the client reports
"Screenshot unavailable. Capture a new screenshot to try again."

This helper re-encodes a screenshot to a palette PNG under a byte budget so it
survives the round trip, optionally cropping to a region first.

Usage:
  python3 scripts/shrink-shot.py IN.png [-o OUT.png]
      [--crop right|left|top|bottom|WxH+X+Y]
      [--max-bytes 10000] [--colors 32] [--width 640]

Examples:
  # whole page, auto-scaled to fit
  python3 scripts/shrink-shot.py .jait/shots/page.png -o .jait/shots/page-small.png

  # native-scale crop of a 460px-wide panel on the right edge
  python3 scripts/shrink-shot.py .jait/shots/page.png --crop right --crop-width 460
"""

from __future__ import annotations

import argparse
import io
import os
import sys

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("Pillow is required: python3 -m pip install Pillow")


def parse_crop(spec: str, size: tuple[int, int]) -> tuple[int, int, int, int]:
    """Return a (left, top, right, bottom) box for a crop spec."""
    width, height = size
    if spec in {"right", "left", "top", "bottom"}:
        raise ValueError("edge crops need --crop-width/--crop-height")
    parts = spec.replace("x", "+").split("+")
    if len(parts) != 4:
        raise ValueError("--crop expects right|left|top|bottom or WxH+X+Y")
    cw, ch, x, y = (int(p) for p in parts)
    return (x, y, min(x + cw, width), min(y + ch, height))


def edge_crop(spec: str, size: tuple[int, int], cw: int, ch: int):
    width, height = size
    if spec == "right":
        return (max(0, width - cw), 0, width, height)
    if spec == "left":
        return (0, 0, min(cw, width), height)
    if spec == "top":
        return (0, 0, width, min(ch, height))
    if spec == "bottom":
        return (0, max(0, height - ch), width, height)
    raise ValueError(f"unknown crop edge: {spec}")


def encode(image: Image.Image, colors: int, width: int | None) -> Image.Image:
    out = image
    if width and width < image.width:
        height = round(image.height * width / image.width)
        out = out.resize((width, height), Image.LANCZOS)
    return out.quantize(colors=colors, dither=Image.NONE)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source")
    ap.add_argument("-o", "--out")
    ap.add_argument("--crop", help="right|left|top|bottom or WxH+X+Y")
    ap.add_argument("--crop-width", type=int, default=460, help="width for left/right edge crops")
    ap.add_argument("--crop-height", type=int, default=600, help="height for top/bottom edge crops")
    ap.add_argument("--max-bytes", type=int, default=10000, help="byte budget for the output PNG")
    ap.add_argument("--colors", type=int, default=32, help="palette size (fewer colours = smaller file)")
    ap.add_argument("--width", type=int, default=0, help="scale to this width first (0 = native)")
    ap.add_argument("--no-crop", action="store_true", help="ignore --crop")
    args = ap.parse_args()

    if not os.path.exists(args.source):
        sys.exit(f"no such file: {args.source}")

    out_path = args.out or os.path.join(
        os.path.dirname(args.source), f"{os.path.splitext(os.path.basename(args.source))[0]}-small.png"
    )

    src = Image.open(args.source).convert("RGB")
    if args.crop and not args.no_crop:
        box = (
            parse_crop(args.crop, src.size)
            if "x" in args.crop.lower() and "+" in args.crop
            else edge_crop(args.crop, src.size, args.crop_width, args.crop_height)
        )
        src = src.crop(box)

    attempts = []
    for colors in (args.colors, max(8, args.colors // 2), 8, 4):
        for width in (args.width, 640, 520, 420, 340, 260):
            if width and width >= src.width and width != args.width:
                continue
            key = (colors, width)
            if key in attempts:
                continue
            attempts.append(key)

    best = None
    for colors, width in attempts:
        candidate = encode(src, colors, width or None)
        buffer = io.BytesIO()
        candidate.save(buffer, format="PNG", optimize=True)
        size = buffer.tell()
        if best is None or size < best[0]:
            best = (size, candidate, colors, width)
        if size <= args.max_bytes:
            candidate.save(out_path, optimize=True)
            print(f"{out_path}  {candidate.size[0]}x{candidate.size[1]}  {size} bytes  ({colors} colours, width {width or 'native'})")
            print(f"inline payload ~{int(size * 4 / 3) * 2} chars (stays under the ~32k truncation limit)")
            return 0

    assert best is not None
    size, candidate, colors, width = best
    candidate.save(out_path, optimize=True)
    print(f"warning: smallest option is {size} bytes (budget {args.max_bytes})", file=sys.stderr)
    print(f"{out_path}  {candidate.size[0]}x{candidate.size[1]}  {size} bytes  ({colors} colours, width {width or 'native'})")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
