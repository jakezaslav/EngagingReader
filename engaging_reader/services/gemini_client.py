"""Google Gemini client initialization."""
import os

from google import genai

from engaging_reader.extensions import get_logger

logger = get_logger(__name__)

_client = None


def initialize_genai_client():
    # Prefer API key auth when provided.
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if api_key:
        return genai.Client(api_key=api_key)

    # Otherwise fall back to Vertex AI service account auth.
    service_account_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not service_account_json:
        raise ValueError(
            "Set GEMINI_API_KEY (or GOOGLE_API_KEY) for API key auth, "
            "or set GOOGLE_SERVICE_ACCOUNT_JSON for Vertex AI auth."
        )

    try:
        # Write credentials to a temp file for authentication
        with open("temp_service_account.json", "w") as f:
            f.write(service_account_json)
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "temp_service_account.json"
    except Exception as e:
        logger.error(f"Error handling service account: {e}")
        raise

    # Return a Gemini client authenticated with Vertex AI
    return genai.Client(
        vertexai=True,
        project=os.getenv("GOOGLE_PROJECT", "engaging-reader"),
        location=os.getenv("GOOGLE_LOCATION", "us-central1"),
    )


def set_client(client):
    global _client
    _client = client


def get_client():
    if _client is None:
        raise RuntimeError("Gemini client has not been initialized")
    return _client
