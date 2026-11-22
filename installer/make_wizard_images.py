"""Génère les images de l'assistant d'installation (BMP 24 bits) à partir de pictone.ico.

Usage : python installer/make_wizard_images.py  (Pillow requis, relancer après changement d'icône)
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BACKGROUND = (12, 11, 16)  # #0c0b10, fond de l'application


def compose(size, icon_ratio):
    canvas = Image.new("RGB", size, BACKGROUND)
    icon = Image.open(ROOT / "pictone.ico")
    icon = icon.convert("RGBA")
    width = int(size[0] * icon_ratio)
    height = int(width * icon.height / icon.width)
    icon = icon.resize((width, height), Image.Resampling.LANCZOS)
    canvas.paste(icon, ((size[0] - width) // 2, (size[1] - height) // 2), icon)
    return canvas


if __name__ == "__main__":
    out = Path(__file__).resolve().parent
    compose((164, 314), 0.62).save(out / "wizard_large.bmp", "BMP")
    compose((55, 58), 0.78).save(out / "wizard_small.bmp", "BMP")
    print("Images générées dans", out)
