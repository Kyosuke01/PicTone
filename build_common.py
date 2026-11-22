"""Utilitaires partagés par build_exe.py."""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APP_NAME = "PicTone"


def get_version():
    """Lit version.txt à la racine du dépôt (quitte avec une erreur s'il manque)."""
    version_file = ROOT / "version.txt"
    if not version_file.is_file():
        sys.exit(f"Erreur : {version_file} introuvable.")
    version = version_file.read_text(encoding="utf-8").strip()
    if not re.fullmatch(r"\d+(\.\d+){0,3}", version):
        sys.exit(f"Erreur : version invalide dans version.txt : {version!r} (attendu : X.Y.Z).")
    return version


def version_tuple(version):
    """'3.0.0' -> (3, 0, 0, 0)."""
    parts = [int(p) for p in version.split(".")]
    return tuple((parts + [0] * 4)[:4])
