"""Contextual word definition generation via Gemini."""
from google.genai import types

from engaging_reader.extensions import get_logger
from engaging_reader.services.gemini_client import get_client

logger = get_logger(__name__)


def generate_definition(word, context):
    """Generate a contextual definition for a word. Returns the definition text."""
    logger.info(f"Processing definition for word: '{word}' with context: '{context}'")

    # Compose user input into a single message
    user_prompt = f"""WORD TO DEFINE:
{word}
CONTEXT SENTENCE:
{context}"""
    text_prompt = types.Part.from_text(text=user_prompt)

    # Define system behavior for this task
    system_instruction = types.Part.from_text(text="""You are an expert at communicating and teaching vocabulary to adults in a simple and encouraging way.

**Instructions:**
1.  Your primary task is to define the word provided in the "WORD TO DEFINE" field. You must only define this word.
2.  Use the "CONTEXT SENTENCE" field only to understand the word's meaning. Do not define other words from the context.
3.  Write at a 4th-7th grade reading level. Keep sentences short and use everyday language.
4.  If the word is a common grammatical word (like 'with', 'the', 'a', 'is', 'of'), explain the job it does in the sentence instead of giving a dictionary definition.
5.  For all other words, first give a simple, one-sentence definition. Then, explain its meaning using the context. If no context is given, provide a simple, adult-oriented example sentence.

**Examples:**

---
**Input:**
WORD TO DEFINE:
Liable
CONTEXT SENTENCE:
The tenant is liable for any damage caused to the property.

**Output:**
Liable means you are legally responsible for something. In this sentence, it means the person renting the apartment must pay for anything they break.
---
**Input:**
WORD TO DEFINE:
with
CONTEXT SENTENCE:
They arrived with shouts.

**Output:**
'With' is a word that connects things together. In this sentence, its job is to show that the people ('they') and the 'shouts' arrived at the same time.
---
**Input:**
WORD TO DEFINE:
Mandatory
CONTEXT SENTENCE:

**Output:**
Mandatory means something is required and you have to do it; it is not a choice. For example, it is mandatory to have a driver's license to drive a car.
---
**Input:**
WORD TO DEFINE:
Accrue
CONTEXT SENTENCE:
The interest on your savings account will accrue monthly.

**Output:**
Accrue means to build up or be added over time. In this context, it means the extra money from interest is added to your savings account each month, helping it grow.
---
""")

    # Build the request content
    contents = [
        types.Content(
            role="user",
            parts=[text_prompt]
        )
    ]

    # Configure generation settings
    config = types.GenerateContentConfig(
        temperature=0.2,  # Allows more natural explanations
        top_p=0.95,
        max_output_tokens=8192,
        response_modalities=["TEXT"],
        safety_settings=[  # Apply moderation filters
            types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="BLOCK_LOW_AND_ABOVE"),
            types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="BLOCK_LOW_AND_ABOVE"),
            types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="BLOCK_LOW_AND_ABOVE"),
            types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="BLOCK_LOW_AND_ABOVE")
        ],
        system_instruction=[system_instruction],
    )

    # Call Gemini and stream the result
    client = get_client()
    output_text = ""
    for chunk in client.models.generate_content_stream(
        model="gemini-2.5-flash-lite",
        contents=contents,
        config=config,
    ):
        if chunk.text:  # Only add text if it's not None
            output_text += chunk.text

    logger.info(f"Generated definition: {output_text}")
    return output_text
