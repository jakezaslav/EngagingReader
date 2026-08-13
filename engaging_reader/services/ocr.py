"""OCR / document extraction via Gemini."""
import os
import time

from google.genai import types

from engaging_reader.extensions import get_logger
from engaging_reader.services.gemini_client import get_client
from engaging_reader.services.images import standardize_image

logger = get_logger(__name__)


TRANSLATE_PROMPT = """<role>
You are an expert Document Intelligence AI specializing in vision parsing, text extraction, translation, and structured Markdown formatting for accessibility.
</role>

<instructions>
Analyze the uploaded document image and process its content according to the following logic:

1. LANGUAGE LOGIC
   Evaluate the percentage of {{USER_LANGUAGE}} present in the image:
   - Scenario A (User language present): If {{USER_LANGUAGE}} makes up MORE than 10% of the text:
     * Extract ONLY the text written in {{USER_LANGUAGE}}.
     * Completely IGNORE and DISCARD all non-{{USER_LANGUAGE}} text (including redundant dual-language columns, headings, or translations).
   - Scenario B (User language missing): If 90% or more of the text is in languages OTHER than {{USER_LANGUAGE}}:
     * Translate the ENTIRE document into {{USER_LANGUAGE}}.
     * Retain any isolated words already in {{USER_LANGUAGE}} within their logical position in the translation.

2. FORMATTING RULES
   - Markdown Structure: Return 100% valid Markdown for headings, lists, tables, and body text.
   - Tables: Recreate all visual tables as Markdown tables. Under Scenario A, include ONLY the headers and columns corresponding to {{USER_LANGUAGE}}.
   - Text Styling: Preserve original emphasis (**bold**, *italics*).
   - Footnotes: 
     * Mark references in table cells using standard Markdown notation: `1,234,567[^1]`
     * Define the footnote immediately below the corresponding table: `[^1]: Footnote text here.`
   - Completeness: Ensure all relevant text, numbers, visual notes, and URLs are fully retained.
3. LAYOUT & READING ORDER
   - Two-Page Spreads: If the image contains a two-page book spread, you must process the pages sequentially based on their physical layout.
   - Process and output the ENTIRE left page first (from top to bottom), followed by the ENTIRE right page (from top to bottom). Do not mix text from the two pages based on horizontal alignment.
</instructions>

<output_constraint>
Return ONLY the final Markdown document. Do NOT include any conversational introduction, preamble, markdown block wrappers around the entire output, or trailing explanation. Start directly with the document content.
</output_constraint>"""

UNTRANSLATED_PROMPT = """<role>
You are an expert Document Intelligence AI specializing in vision parsing, targeted text extraction, and structured Markdown formatting for accessibility.
</role>

<instructions>
Analyze the uploaded document image and process its content according to the following logic:

1. LANGUAGE LOGIC & EXTRACTION
   Evaluate the percentage of {{USER_LANGUAGE}} present in the image:
   - Scenario A (User language present): If {{USER_LANGUAGE}} makes up MORE than 10% of the text:
     * Extract ONLY the text written in {{USER_LANGUAGE}}.
     * Completely IGNORE and DISCARD all non-{{USER_LANGUAGE}} text (including redundant dual-language columns, headings, or translations).
   - Scenario B (User language missing or minimal): If {{USER_LANGUAGE}} makes up LESS than 10% of the text:
     * Extract ALL text from the document exactly as it appears.
     * Do NOT translate any text. Keep the original language(s) intact.

2. FORMATTING RULES
   - Markdown Structure: Return 100% valid Markdown for headings, lists, tables, and body text.
   - Tables: Recreate all visual tables as Markdown tables. Under Scenario A, include ONLY the headers and columns corresponding to {{USER_LANGUAGE}}. Under Scenario B, include all original headers and columns.
   - Text Styling: Preserve original emphasis (**bold**, *italics*).
   - Footnotes: 
     * Mark references in table cells using standard Markdown notation: `1,234,567[^1]`
     * Define the footnote immediately below the corresponding table: `[^1]: Footnote text here.`
   - Completeness: Ensure all relevant text, numbers, visual notes, and URLs are fully extracted based on the active scenario.

3. LAYOUT & READING ORDER
   - Two-Page Spreads & Columns: If the image contains a two-page book spread or multiple columns, you must process the content sequentially based on the physical layout.
   - Order: Process and output the ENTIRE left page/column first (from top to bottom), followed by the ENTIRE right page/column (from top to bottom). Do not mix text from the two pages based on horizontal alignment.
</instructions>

<output_constraint>
Return ONLY the final Markdown document. Do NOT include any conversational introduction, preamble, markdown block wrappers around the entire output, or trailing explanation. Start directly with the document content.
</output_constraint>"""


def process_file(file_path, user_language="English", translate=False):
    file_process_start = time.time()
    logger.info(f"[TIMING] process_file() started for: {file_path}")

    user_language = (user_language or "English").strip() or "English"
    if translate:
        prompt_text = TRANSLATE_PROMPT.replace("{{USER_LANGUAGE}}", user_language)
        logger.info(f"OCR translate=True USER_LANGUAGE: {user_language}")
    else:
        prompt_text = UNTRANSLATED_PROMPT.replace("{{USER_LANGUAGE}}", user_language)
        logger.info(f"OCR translate=False using UNTRANSLATED_PROMPT USER_LANGUAGE: {user_language}")

    # Create a prompt to guide Gemini on how to extract the data
    text_prompt = types.Part.from_text(text=prompt_text)

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
        model="gemini-3.5-flash-lite",
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
