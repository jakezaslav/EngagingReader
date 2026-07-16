"""WSGI entrypoint for Gunicorn and local development."""
import os

from engaging_reader import create_app

app = create_app()

if __name__ == "__main__":
    # Only run Flask development server when running directly (not through Gunicorn)
    if not os.getenv("GUNICORN_RUNNING"):
        app.run(
            debug=os.getenv("FLASK_DEBUG", "false").lower() == "true",  # Enable debug mode from env
            host="0.0.0.0",                                             # Bind to all interfaces
            port=int(os.getenv("PORT", "5000"))                         # Use PORT from env or fallback to 5000
        )
