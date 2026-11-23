"""Génère le fond de la fenêtre d'installation macOS (.dmg) : une flèche entre l'app et Applications.

Usage : python installer/make_dmg_background.py  -> dmg_background.png (660x400) et @2x (1320x800)
"""

from pathlib import Path

from PIL import Image, ImageDraw

BACKGROUND = (12, 11, 16)  # #0c0b10, fond de l'application
ACCENT = (0, 122, 204)     # #007acc, couleur d'accent de l'interface


def draw(scale):
    width, height = 660 * scale, 400 * scale
    image = Image.new("RGB", (width, height), BACKGROUND)
    draw_ = ImageDraw.Draw(image)
    # Positions des icônes (en points) : app à gauche (180, 190), Applications à droite (480, 190).
    y = 190 * scale
    start_x, end_x = 262 * scale, 398 * scale
    line_width = 8 * scale
    draw_.line([(start_x, y), (end_x - 18 * scale, y)], fill=ACCENT, width=line_width)
    head = 30 * scale
    draw_.polygon([(end_x, y), (end_x - head, y - head * 0.8), (end_x - head, y + head * 0.8)], fill=ACCENT)
    return image


if __name__ == "__main__":
    out = Path(__file__).resolve().parent
    draw(1).save(out / "dmg_background.png")
    draw(2).save(out / "dmg_background@2x.png")
    print("Fonds générés dans", out)
