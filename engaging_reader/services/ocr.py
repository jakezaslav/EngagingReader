"""OCR / document extraction via Gemini."""
import os
import time

from google.genai import types

from engaging_reader.extensions import get_logger
from engaging_reader.services.gemini_client import get_client
from engaging_reader.services.images import standardize_image

logger = get_logger(__name__)


def process_file(file_path):
    file_process_start = time.time()
    logger.info(f"[TIMING] process_file() started for: {file_path}")

    # Create a prompt to guide Gemini on how to extract the data
    text_prompt = types.Part.from_text(text="""Act as an expert document intelligence agent. Your mission is to analyze the document (image or PDF), process its content based on the rules below, and generate a clean, well-structured Markdown document.

Step 1: Language Processing Rule

First, estimate the language distribution in the image and follow the corresponding instruction:

Scenario A: The document contains a significant amount of English text (i.e., English makes up more than 10% of the content).

Action: Extract only the English content. Completely ignore and discard all non-English text.

Scenario B: The document is overwhelmingly non-English (i.e., 90% or more of the text is in a non-English language).

Action: Translate the entire document into English. Any isolated English words should be kept and included in their logical place within the final translated output.

Step 2: Output Rule

Do not include any introductory text, explanations, or preambles in your response. Begin the response directly with the extracted or translated content.

Step 3: Formatting Instructions

After processing the language according to the rule above, format the entire output using these guidelines:

Markdown Output: The entire response must be in Markdown. This includes all text, headings, tables, and lists.

Tables:
-- Recreate all tables as proper Markdown tables.
-- If you are following Scenario A, ensure the tables are built using only the English headers and data columns.

Preserve original emphasis like bold and italics. Preserve paragraphs.

Footnotes:
-- If a table has footnotes, place the full footnote text immediately below its corresponding table.
-- In the table cell, mark the reference number with brackets and a carrot, like this: 1,234,567[^1].
-- Begin the footnote text itself with the same marker, like this: [^1]: This is the footnote text.

Completeness: Ensure all extracted (or translated) text, including any URLs, is present in the final output.""")

    # Read and process the file (image or PDF)
    read_start = time.time()
    with open(file_path, "rb") as file:
        original_file_bytes = file.read()
    read_duration = time.time() - read_start
    logger.info(f"[TIMING] File read in {read_duration:.3f} seconds ({len(original_file_bytes)} bytes)")

    # Determine file type based on extension
    _, file_extension = os.path.splitext(file_path.lower())

    if file_extension == '.pdf':
        # Handle PDF files directly - no standardization needed
        file_data = original_file_bytes
        mime_type = "application/pdf"
        logger.info(f"[TIMING] Processing PDF file: {len(original_file_bytes)} bytes")

    else:
        # Handle image files with standardization
        try:
            standardize_start = time.time()
            # Standardize the image to improve OCR accuracy and reduce processing time
            standardized_image_bytes = standardize_image(original_file_bytes)
            standardize_duration = time.time() - standardize_start
            logger.info(f"[TIMING] Image standardized in {standardize_duration:.3f} seconds: {len(original_file_bytes)} -> {len(standardized_image_bytes)} bytes")

            # Use standardized image data
            file_data = standardized_image_bytes
            mime_type = "image/jpeg"  # Standardized images are always JPEG

        except Exception as e:
            # Fall back to original image if standardization fails
            logger.warning(f"Image standardization failed, using original: {e}")
            file_data = original_file_bytes

            # Determine MIME type based on file extension for fallback
            if file_extension in ['.png']:
                mime_type = "image/png"
            elif file_extension in ['.jpg', '.jpeg']:
                mime_type = "image/jpeg"
            elif file_extension in ['.heic', '.heif']:
                mime_type = "image/heic"
            elif file_extension in ['.webp']:
                mime_type = "image/webp"
            else:
                # Default to JPEG for unsupported formats
                mime_type = "image/jpeg"

    file_part = types.Part.from_bytes(
        data=file_data,
        mime_type=mime_type,
    )

    # Package the user message as content parts for Gemini
    contents = [
        types.Content(
            role="user",
            parts=[text_prompt, file_part]
        )
    ]

    # Define generation behavior
    config = types.GenerateContentConfig(
        temperature=0,             # Zero creativity for accurate transcription
        top_p=0.95,
        max_output_tokens=8192,   # Large limit to avoid cutoff for long docs
        response_modalities=["TEXT"]
    )

    # Stream response from Gemini and concatenate result
    client = get_client()
    gemini_start = time.time()
    logger.info(f"[TIMING] Starting Gemini API call")
    output_text = ""
    first_chunk_received = False
    for chunk in client.models.generate_content_stream(
        model="gemini-2.5-flash",
        contents=contents,
        config=config,
    ):
        if chunk.text:  # Only add text if it's not None
            if not first_chunk_received:
                first_chunk_time = time.time() - gemini_start
                logger.info(f"[TIMING] First chunk received in {first_chunk_time:.3f} seconds")
                first_chunk_received = True
            output_text += chunk.text

    gemini_duration = time.time() - gemini_start
    logger.info(f"[TIMING] Gemini API completed in {gemini_duration:.3f} seconds")

    total_process_duration = time.time() - file_process_start
    logger.info(f"[TIMING] Total process_file() duration: {total_process_duration:.3f} seconds")

    return output_text  # Return the markdown-formatted output
