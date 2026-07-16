"""In-memory async job storage."""
import threading
import uuid
from datetime import datetime, timedelta

job_storage = {}
job_lock = threading.Lock()


def create_job():
    """Create a new job and return its ID"""
    job_id = str(uuid.uuid4())
    with job_lock:
        job_storage[job_id] = {
            "status": "processing",
            "created_at": datetime.now(),
            "result": None,
            "error": None
        }
    return job_id


def update_job(job_id, status=None, result=None, error=None):
    """Update job status"""
    with job_lock:
        if job_id in job_storage:
            if status:
                job_storage[job_id]["status"] = status
            if result is not None:
                job_storage[job_id]["result"] = result
            if error is not None:
                job_storage[job_id]["error"] = error


def get_job(job_id):
    """Get job status"""
    with job_lock:
        return job_storage.get(job_id)


def cleanup_old_jobs():
    """Remove jobs older than 1 hour"""
    with job_lock:
        cutoff = datetime.now() - timedelta(hours=1)
        to_remove = [
            job_id for job_id, job in job_storage.items()
            if job["created_at"] < cutoff
        ]
        for job_id in to_remove:
            del job_storage[job_id]
