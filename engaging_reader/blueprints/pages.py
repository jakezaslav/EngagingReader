"""Homepage routes."""
from flask import Blueprint, render_template

pages_bp = Blueprint("pages", __name__)


@pages_bp.route("/")
def index():
    return render_template("index.html")  # Loads index.html from templates folder
