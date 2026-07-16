"""Word definition API routes."""
from flask import Blueprint, jsonify, request

from engaging_reader.extensions import get_logger
from engaging_reader.services.definitions import generate_definition

logger = get_logger(__name__)

definitions_bp = Blueprint("definitions", __name__)


@definitions_bp.route("/get-definition", methods=["POST"])
def get_definition():
    try:
        data = request.get_json()
        logger.info(f"Received data: {data}")  # Log raw incoming request

        # Input validation
        if not data:
            return jsonify({"error": "No data provided"}), 400

        word = data.get("word to define", "").strip()
        context = data.get("context sentence", "").strip()

        if not word:
            return jsonify({"error": "Word to define is required"}), 400
        if not context:
            return jsonify({"error": "Context sentence is required"}), 400

        output_text = generate_definition(word, context)
        return jsonify({"definition": output_text})

    except Exception as e:
        logger.error(f"Error in get_definition: {str(e)}", exc_info=True)
        return jsonify({"error": "An error occurred while processing your request"}), 500
