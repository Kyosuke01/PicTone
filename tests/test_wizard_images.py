"""Tests de installer/make_wizard_images.py : images de l'assistant d'installation."""

from pathlib import Path

from PIL import Image, ImageChops

from installer import make_wizard_images as wizard

BACKGROUND = (12, 11, 16)


def test_compose_returns_requested_size():
    image = wizard.compose((164, 314), 0.62)
    assert image.size == (164, 314)
    assert image.mode == "RGB"


def test_compose_fills_background_color():
    image = wizard.compose((164, 314), 0.62)
    assert image.getpixel((0, 0)) == BACKGROUND
    assert image.getpixel((163, 313)) == BACKGROUND


def _visible_box(image):
    background = Image.new("RGB", image.size, BACKGROUND)
    return ImageChops.difference(image, background).getbbox()


def test_compose_draws_the_icon_centered_at_requested_scale():
    image = wizard.compose((164, 314), 0.62)
    x0, y0, x1, y1 = _visible_box(image)
    assert abs((x0 + x1) / 2 - 82) <= 3
    assert abs((y0 + y1) / 2 - 157) <= 3
    assert 0.55 * 164 <= (x1 - x0) <= 0.62 * 164 + 1
    assert 0.55 * 164 <= (y1 - y0) <= 0.62 * 164 + 1  # icône carrée : hauteur = largeur


def test_small_image_is_smaller_than_large():
    large = wizard.compose((164, 314), 0.62)
    small = wizard.compose((55, 58), 0.78)
    assert small.size == (55, 58)
    assert large.size[0] * large.size[1] > small.size[0] * small.size[1]


def test_committed_bitmaps_have_the_expected_sizes():
    folder = Path(wizard.__file__).resolve().parent
    assert Image.open(folder / "wizard_large.bmp").size == (164, 314)
    assert Image.open(folder / "wizard_small.bmp").size == (55, 58)
