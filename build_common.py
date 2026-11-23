"""Utilitaires partagés par les scripts de build."""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APP_NAME = "PicTone"
VERSION_PATTERN = re.compile(r"\d+(?:\.\d+){0,3}")


def get_version(root=None):
    """Lit version.txt (quitte avec une erreur s'il manque ou s'il est invalide)."""
    base = Path(root) if root is not None else ROOT
    version_file = base / "version.txt"
    if not version_file.is_file():
        sys.exit(f"Erreur : {version_file} introuvable.")
    version = version_file.read_text(encoding="utf-8").strip()
    if not VERSION_PATTERN.fullmatch(version):
        sys.exit(f"Erreur : version invalide dans version.txt : {version!r} (attendu : X.Y.Z).")
    return version


def version_tuple(version):
    """'3.0.0' -> (3, 0, 0, 0)."""
    parts = [int(p) for p in version.split(".")]
    return tuple((parts + [0, 0, 0, 0])[:4])
