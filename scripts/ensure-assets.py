#!/usr/bin/env python3
"""
Ensures required PNG icon assets exist before `vite build` and `build-apk.py` run
(especially in fresh CI/GitHub Actions environments where binary PNGs might not be synced).
"""
import os
import struct
import zlib


def make_Fallback_png(width: int, height: int) -> bytes:
    """Generates a valid RGBA PNG icon (emerald/dark slate Simple messenger icon) using pure Python stdlib."""
    raw_rows = bytearray()
    cx, cy = width / 2.0, height / 2.0
    radius = width * 0.42
    for y in range(height):
        raw_rows.append(0)  # Filter type 0 (None)
        for x in range(width):
            dx = x - cx
            dy = y - cy
            dist = (dx * dx + dy * dy) ** 0.5
            if dist <= radius:
                # Emerald gradient circle (#10b981 -> #059669)
                raw_rows.extend((16, 185, 129, 255))
            else:
                # Dark slate rounded background (#0f172a)
                raw_rows.extend((15, 23, 42, 255))

    def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(chunk_type + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + chunk_type + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw_rows), 9)
    return (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", ihdr)
        + png_chunk(b"IDAT", idat)
        + png_chunk(b"IEND", b"")
    )


def ensure_assets() -> None:
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    required_pngs = [
        (os.path.join(root_dir, "public", "icon-192.png"), 192),
        (os.path.join(root_dir, "public", "icon-512.png"), 256),
        (os.path.join(root_dir, "public", "apple-touch-icon.png"), 180),
        (os.path.join(root_dir, "public", "favicon.png"), 64),
        (os.path.join(root_dir, "public", "pwa-192x192.png"), 192),
        (os.path.join(root_dir, "public", "pwa-512x512.png"), 256),
        (os.path.join(root_dir, "public", "pwa-maskable-512x512.png"), 256),
        (os.path.join(root_dir, "src", "assets", "images", "simple_app_icon.png"), 192),
    ]
    for path, size in required_pngs:
        if not os.path.exists(path) or os.path.getsize(path) < 64:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "wb") as f:
                f.write(make_Fallback_png(size, size))


if __name__ == "__main__":
    ensure_assets()
