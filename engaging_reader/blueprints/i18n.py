"""i18n locale JSON routes."""
from flask import Blueprint, abort, send_from_directory

from engaging_reader.config import I18N_DIR, SUPPORTED_I18N_LANGS

i18n_bp = Blueprint("i18n", __name__)


@i18n_bp.route("/i18n/<lang_code>.json")
def serve_i18n(lang_code):
    if lang_code not in SUPPORTED_I18N_LANGS:
        abort(404)
    return send_from_directory(I18N_DIR, f"{lang_code}.json")
