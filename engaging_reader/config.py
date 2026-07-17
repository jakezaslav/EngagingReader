"""Application configuration and path helpers."""
import os
from pathlib import Path

# Project root (parent of the engaging_reader package)
PROJECT_ROOT = Path(__file__).resolve().parent.parent

UPLOAD_FOLDER = "uploads"
I18N_DIR = PROJECT_ROOT / "i18n"
SUPPORTED_I18N_LANGS = frozenset({"en", "es", "fr", "uk", "fil", "tr", "pt", "pa", "zh"})

TEMPLATE_FOLDER = str(PROJECT_ROOT / "templates")
STATIC_FOLDER = str(PROJECT_ROOT / "static")

# Canonical public site URL (no trailing slash)
SITE_URL = os.getenv("SITE_URL", "https://engagingreader.com").rstrip("/")

SITE_NAME = "Engaging Reader"
SITE_TAGLINE = "Your AI Reading Companion"
SITE_TITLE = f"{SITE_NAME} — {SITE_TAGLINE}"
# From README "What We Do" — keep under ~160 chars for SERP snippets
SITE_DESCRIPTION = (
    "At Engaging Reader, we make reading accessible for everyone. Our AI-powered web app "
    "helps people confidently read news articles, emails, signs, and job postings."
)
SITE_KEYWORDS = (
    "accessible reading, AI reading companion, text to speech, OCR, "
    "word definitions, document translation, PDF reader, "
    "low literacy, Engaging Reader"
)
SITE_FEATURES = (
    "Snap & Convert: Snap a photo or upload a file and turn it into clear, easy-to-read text",
    "Listen Along: Hear text read aloud with word-by-word highlighting",
    "Define Words: Get context-specific definitions that make sense",
    "Translate: Convert documents into English for easier reading",
    "Multi-format support for images and multi-page PDFs up to 50MB",
    "Multilingual interface: English, Spanish, French, Filipino, Portuguese, Punjabi, Turkish, Ukrainian, and Chinese",
)
OG_IMAGE_PATH = "/static/assets/Demo_page.png"
OG_IMAGE_WIDTH = 2032
OG_IMAGE_HEIGHT = 1146
