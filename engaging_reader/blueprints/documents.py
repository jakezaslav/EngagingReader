"""Document upload and job status routes."""
import os
import re
import threading
import uuid
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request

from engaging_reader.extensions import get_logger
from engaging_reader.jobs import cleanup_old_jobs, create_job, get_job, update_job
from engaging_reader.services.ocr import process_file

logger = get_logger(__name__)

documents_bp = Blueprint("documents", __name__)


@documents_bp.route("/upload", methods=["POST"])
def upload_file():
    # Validate presence of file
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    # Sanitize filename to prevent path traversal attacks
    original_filename = file.filename
    if not original_filename:
        return jsonify({"error": "Invalid filename"}), 400

    # Get only the basename to prevent path traversal
    safe_basename = os.path.basename(original_filename)

    # Remove any remaining path separators and dangerous characters
    safe_basename = re.sub(r'[^\w\s.-]', '', safe_basename)

    # Limit filename length
    safe_basename = safe_basename[:255]

    # Generate unique filename to prevent collisions
    file_extension = os.path.splitext(safe_basename)[1].lower()

    # Validate file extension is allowed
    allowed_extensions = ('.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.pdf')
    if not file_extension or file_extension not in allowed_extensions:
        return jsonify({"error": "File type not allowed. Supported formats: JPG, PNG, HEIC, WebP, PDF"}), 400

    # Generate unique filename with the validated extension
    unique_filename = f"{uuid.uuid4().hex}{file_extension}"

    # Use Path for secure path joining (prevents path traversal)
    upload_folder = Path(current_app.config["UPLOAD_FOLDER"]).resolve()
    filepath = upload_folder / unique_filename

    # Ensure the filepath is within the upload folder (extra safety check)
    try:
        filepath.resolve().relative_to(upload_folder.resolve())
    except ValueError:
        return jsonify({"error": "Invalid file path"}), 400

    # Save file to uploads folder
    try:
        file.save(str(filepath))
    except Exception as save_error:
        logger.error(f"Error saving file: {str(save_error)}")
        return jsonify({"error": "Failed to save file. Please try again."}), 500

    # Create job and start background processing
    job_id = create_job()
    logger.info(f"Created job {job_id} for file {original_filename}")

    # Start background thread to process file
    def process_in_background():
        try:
            logger.info(f"[JOB {job_id}] Starting file processing")
            extracted_markdown = process_file(str(filepath))
            update_job(job_id, status="completed", result={
                "markdown": extracted_markdown,
                "filename": original_filename
            })
            logger.info(f"[JOB {job_id}] Processing completed")
        except Exception as e:
            logger.error(f"[JOB {job_id}] Error processing file: {str(e)}")
            update_job(job_id, status="failed", error=str(e))
        finally:
            # Clean up file
            if filepath.exists():
                filepath.unlink()
            # Clean up old jobs periodically
            cleanup_old_jobs()

    thread = threading.Thread(target=process_in_background)
    thread.daemon = True
    thread.start()

    # Return immediately with job ID
    return jsonify({
        "job_id": job_id,
        "status": "processing"
    }), 202  # 202 Accepted status code


@documents_bp.route("/status/<job_id>", methods=["GET"])
def get_job_status(job_id):
    job = get_job(job_id)

    if not job:
        return jsonify({"error": "Job not found"}), 404

    response = {
        "status": job["status"]
    }

    if job["status"] == "completed":
        response["result"] = job["result"]
    elif job["status"] == "failed":
        response["error"] = job["error"]

    return jsonify(response)
