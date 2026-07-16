"""Image standardization helpers."""
import io

from PIL import Image, ImageFilter


def standardize_image(input_image_bytes: bytes, options: dict = None) -> bytes:
    """
    Standardizes an image by resizing, sharpening, and compressing to JPEG.
    Ideal for processing user-uploaded photos to ensure consistency and performance.

    Args:
        input_image_bytes: The raw bytes of the input image (HEIC, JPEG, etc.).
        options: A dictionary for optional settings.
            - max_dimension (int): The maximum width or height. Defaults to 2048.
            - quality (int): The output JPEG quality (1-95). Defaults to 85.

    Returns:
        The raw bytes of the processed JPEG image.

    Raises:
        IOError: If the image format is not supported or the data is corrupt.
    """
    if options is None:
        options = {}

    settings = {
        'max_dimension': options.get('max_dimension', 2048),
        'quality': options.get('quality', 85)
    }

    try:
        # Open the image from in-memory bytes
        image_stream = io.BytesIO(input_image_bytes)
        with Image.open(image_stream) as img:
            # If image has transparency (like some PNGs or HEICs), convert it to RGB
            # as JPEG does not support an alpha channel.
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")

            # Resize the image while maintaining aspect ratio
            img.thumbnail((settings['max_dimension'], settings['max_dimension']))

            # Sharpen the image to enhance text clarity
            img = img.filter(ImageFilter.SHARPEN)

            # Save the processed image to an in-memory buffer
            output_buffer = io.BytesIO()
            img.save(
                output_buffer,
                format="JPEG",
                quality=settings['quality'],
                optimize=True  # Makes an extra pass to find best compression
            )
            return output_buffer.getvalue()

    except Exception as e:
        print(f"Error during image standardization: {e}")
        # Re-raising the exception allows the calling function to handle the error
        raise
