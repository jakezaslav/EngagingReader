"""Application configuration and path helpers."""
from pathlib import Path

# Project root (parent of the engaging_reader package)
PROJECT_ROOT = Path(__file__).resolve().parent.parent

UPLOAD_FOLDER = "uploads"
I18N_DIR = PROJECT_ROOT / "i18n"
SUPPORTED_I18N_LANGS = frozenset({"en", "es", "fr", "uk", "fil", "tr", "pt", "pa", "zh"})

TEMPLATE_FOLDER = str(PROJECT_ROOT / "templates")
STATIC_FOLDER = str(PROJECT_ROOT / "static")
