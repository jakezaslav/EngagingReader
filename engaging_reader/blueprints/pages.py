"""Homepage and SEO routes."""
from flask import Blueprint, Response, render_template

from engaging_reader.config import (
    OG_IMAGE_HEIGHT,
    OG_IMAGE_PATH,
    OG_IMAGE_WIDTH,
    SITE_DESCRIPTION,
    SITE_FEATURES,
    SITE_KEYWORDS,
    SITE_NAME,
    SITE_TAGLINE,
    SITE_TITLE,
    SITE_URL,
)

pages_bp = Blueprint("pages", __name__)


def _seo_context():
    return {
        "site_url": SITE_URL,
        "site_name": SITE_NAME,
        "site_tagline": SITE_TAGLINE,
        "site_title": SITE_TITLE,
        "site_description": SITE_DESCRIPTION,
        "site_keywords": SITE_KEYWORDS,
        "site_features": SITE_FEATURES,
        "og_image_url": f"{SITE_URL}{OG_IMAGE_PATH}",
        "og_image_width": OG_IMAGE_WIDTH,
        "og_image_height": OG_IMAGE_HEIGHT,
    }


@pages_bp.route("/")
def index():
    return render_template("index.html", **_seo_context())


@pages_bp.route("/robots.txt")
def robots_txt():
    body = (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /upload\n"
        "Disallow: /status/\n"
        "Disallow: /get-definition\n"
        "Disallow: /i18n/\n"
        f"Sitemap: {SITE_URL}/sitemap.xml\n"
    )
    return Response(body, mimetype="text/plain")


@pages_bp.route("/sitemap.xml")
def sitemap_xml():
    body = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>{SITE_URL}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
"""
    return Response(body, mimetype="application/xml")
