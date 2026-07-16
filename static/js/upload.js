window.ER = window.ER || {};
(function (ER) {
'use strict';
async function uploadImage() {
    // Hide speech controls when starting new upload
    document.getElementById('speech-controls').style.display = 'none';
    
    if (!ER.state.fileInput.files.length) {
        ER.showError(t('errors.selectFileVisible'));
        ER.announceError(t('errors.selectFile'));
        return;
    }

    const file = ER.state.fileInput.files[0];

    // Validate file type - support images and PDFs
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'application/pdf'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.pdf'];
    
    // Check both MIME type and file extension (HEIC files might not have proper MIME type on all browsers)
    const fileName = file.name.toLowerCase();
    const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
    
    if (!allowedTypes.includes(file.type) && !hasValidExtension) {
        ER.showError(t('errors.invalidTypeVisible'));
        ER.announceError(t('errors.invalidType'));
        return;
    }

    // Check file size (50MB limit - generous for high-quality documents)
    const maxSize = 50 * 1024 * 1024; // 50MB in bytes
    if (file.size > maxSize) {
        ER.showError(t('errors.fileTooLargeVisible'));
        ER.announceError(t('errors.fileTooLarge'));
        return;
    }

    // Show loading state
    ER.state.loadingOverlay.style.display = 'flex';
    ER.state.outputDiv.innerHTML = "";
    ER.announceStatus(t('status.processing'));

    try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/upload", {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || t('errors.uploadFailed'));
        }

        // Get job ID and poll for results
        if (!data.job_id) {
            throw new Error("Server did not return a job ID. Please try again.");
        }

        const jobId = data.job_id;
        let pollAttempts = 0;
        const maxPollAttempts = 300; // 5 minutes max (300 * 1 second)
        const pollInterval = 1000; // Poll every 1 second

        const pollForResults = async () => {
            try {
                const statusResponse = await fetch(`/status/${jobId}`);
                const statusData = await statusResponse.json();
                
                if (!statusResponse.ok) {
                    throw new Error(statusData.error || t('errors.statusCheckFailed'));
                }
                
                if (statusData.status === "completed") {
                    // Processing complete, render the markdown
                    const dirtyHtml = marked.parse(statusData.result.markdown || "");
                    const cleanHtml = DOMPurify.sanitize(dirtyHtml);
                    
                    ER.state.outputDiv.innerHTML = cleanHtml;
                    ER.wrapWordsInSpans(ER.state.outputDiv);
                    ER.initializeWordNavigation();
                    
                    // Enable play button and store the current text
                    ER.state.currentText = cleanHtml;
                    
                    // Set initial button states (not playing)
                    ER.updateButtonStates(false);

                    // Show speech controls after successful processing
                    document.getElementById('speech-controls').style.display = 'flex';

                    // Hide upload container and show content
                    document.getElementById('upload-container').style.display = 'none';
                    
                    ER.state.loadingOverlay.style.display = 'none';
                    ER.announceStatus(t('status.extracted'));
                } else if (statusData.status === "failed") {
                    throw new Error(statusData.error || "Processing failed");
                } else if (statusData.status === "processing") {
                    // Still processing, poll again
                    pollAttempts++;
                    if (pollAttempts >= maxPollAttempts) {
                        throw new Error("Processing timed out. Please try again.");
                    }
                    setTimeout(pollForResults, pollInterval);
                } else {
                    // Unexpected status - log and treat as error
                    console.error("Unexpected job status:", statusData.status);
                    throw new Error("Unexpected processing status. Please try again.");
                }
            } catch (error) {
                console.error("Error polling for results:", error);
                ER.state.loadingOverlay.style.display = 'none';
                ER.showError(error.message);
                ER.announceError(t('errors.processFailed'));
                // Keep speech controls hidden on error
                document.getElementById('speech-controls').style.display = 'none';
            }
        };

        // Start polling
        pollForResults();

    } catch (error) {
        ER.showError(error.message);
        ER.announceError(t('errors.processFailed'));
        // Keep speech controls hidden on error
        document.getElementById('speech-controls').style.display = 'none';
        ER.state.loadingOverlay.style.display = 'none';
    }
}
  ER.uploadImage = uploadImage;
})(window.ER);
