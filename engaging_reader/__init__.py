"""Engaging Reader Flask application factory."""
import os

from dotenv import load_dotenv
from flask import Flask

from engaging_reader.blueprints.definitions import definitions_bp
from engaging_reader.blueprints.documents import documents_bp
from engaging_reader.blueprints.i18n import i18n_bp
from engaging_reader.blueprints.pages import pages_bp
from engaging_reader.config import STATIC_FOLDER, TEMPLATE_FOLDER, UPLOAD_FOLDER
from engaging_reader.extensions import configure_logging, register_heif_opener
from engaging_reader.services.gemini_client import initialize_genai_client, set_client


def create_app():
    load_dotenv()
    configure_logging()
    register_heif_opener()

    app = Flask(
        __name__,
        template_folder=TEMPLATE_FOLDER,
        static_folder=STATIC_FOLDER,
    )

    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

    client = initialize_genai_client()
    set_client(client)
    app.extensions["genai_client"] = client

    app.register_blueprint(pages_bp)
    app.register_blueprint(i18n_bp)
    app.register_blueprint(documents_bp)
    app.register_blueprint(definitions_bp)

    return app
