# Engaging Reader

## What We Do

At Engaging Reader, we make reading accessible for everyone. Our AI-powered web app helps people confidently read everything from news articles and emails to signs and job postings. With Engaging Reader, you can:

- **Snap & Convert:** Snap a photo on your phone or upload a file from your computer and instantly turn it into clear, easy-to-read text
- **Listen Along:** Listen as your text is read aloud with simple, word-by-word highlighting
- **Define Words:** Click on words for context-specific definitions that make sense
- **Translate:** Convert documents into your preferred language for easier reading

## Features

- **Document processing:** Upload JPEG, PNG, WebP, HEIC/HEIF, or PDF (up to 50MB). Gemini 3.5 Flash Lite extracts text and keeps headings, paragraphs, and tables.
- **Listen along:** Browser text-to-speech with word-by-word highlighting. Voice follows the document language.
- **Definitions:** Click a word (or press Enter) for a context-specific explanation at a grade 4–7 reading level (also Gemini 3.5 Flash Lite).
- **Translate:** Optional toggle translates the extracted document into the selected UI language.
- **Languages:** English, Spanish, French, Filipino, Portuguese, Punjabi, Turkish, Ukrainian, Russian, Haitian Creole, Chinese, Arabic, Hebrew, Urdu, Farsi, and Dari. Preference is saved in the browser. Arabic, Hebrew, Urdu, Farsi, and Dari documents read right-to-left.
- **Image optimization:** For photos, resize (max 2048px), JPEG quality 85, and sharpening before OCR. PDFs are sent as-is.

## Prerequisites

- Python 3.9 or higher (Flask 3.1)
- Node.js 18 or higher (for build-time UI locale translation)
- A [Gemini API key](https://aistudio.google.com/apikey), **or** a Google Cloud project with Vertex AI and a service account
- A [DeepL API key](https://www.deepl.com/pro-api) (for `npm run translate` and Render builds)

## Setup

```bash
git clone <your-repository-url>
cd EngagingReader
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` in the project root (never commit it; it is gitignored):

```bash
# Required for OCR and definitions — pick ONE auth method:

# Option A: Gemini API key
GEMINI_API_KEY=your-gemini-api-key

# Option B: Vertex AI (JSON key as one line)
# GOOGLE_SERVICE_ACCOUNT_JSON={"type": "service_account", "project_id": "your-project", ...}
# GOOGLE_PROJECT=your-google-cloud-project-id
# GOOGLE_LOCATION=us-central1

# Required for UI locale translation (npm run translate / Render build)
DEEPL_API_KEY=your-deepl-api-key:fx

FLASK_DEBUG=false
PORT=5000
```

Free DeepL keys end with `:fx`; the translator uses `api-free.deepl.com` for those automatically.

### Vertex AI (optional)

If you are not using `GEMINI_API_KEY`:

1. Enable the Vertex AI API in the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a service account with the **Vertex AI User** role.
3. Download a JSON key and paste the entire file as one line into `GOOGLE_SERVICE_ACCOUNT_JSON`.

### Run

```bash
python app.py
```

Open [http://localhost:5000](http://localhost:5000). Click the Engaging Reader banner to start over with a new file.

For a production-style server (Gunicorn’s default is port 8000 unless you set `PORT`):

```bash
gunicorn app:app --timeout 300
```

### UI strings

Edit English copy in `i18n/en.json`, then:

```bash
npm run translate
```

Render’s `scripts/build.sh` runs this after `pip install`. Set `SKIP_I18N_TRANSLATE=1` to skip.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | ✅* | - | Gemini API key |
| `GOOGLE_API_KEY` | ✅* | - | Alias for `GEMINI_API_KEY` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | ✅* | - | Vertex AI service account JSON (one line) |
| `DEEPL_API_KEY` | ✅** | - | DeepL key for build-time UI translation |
| `GOOGLE_PROJECT` | ❌ | `engaging-reader` | Google Cloud project ID |
| `GOOGLE_LOCATION` | ❌ | `us-central1` | Vertex AI region |
| `SITE_URL` | ❌ | `https://engagingreader.com` | Canonical site URL (Open Graph, sitemap) |
| `FLASK_DEBUG` | ❌ | `false` | Flask debug logging |
| `PORT` | ❌ | `5000` | Port for `python app.py` |

\* One of `GEMINI_API_KEY` / `GOOGLE_API_KEY` or `GOOGLE_SERVICE_ACCOUNT_JSON` is required at runtime.  
\*\* Required for `npm run translate` / Render build unless `SKIP_I18N_TRANSLATE=1`.

## Troubleshooting

1. **`GOOGLE_SERVICE_ACCOUNT_JSON` not set** — Use `GEMINI_API_KEY` instead, or put the JSON on one line in `.env`.
2. **`DEEPL_API_KEY` is required** — Add it to `.env` locally and to the Render Environment settings (not GitHub). Skip with `SKIP_I18N_TRANSLATE=1`.
3. **Permission denied (Google Cloud)** — Service account needs **Vertex AI User**; Vertex AI API must be enabled; `GOOGLE_PROJECT` must match the key.
4. **Text-to-speech silent** — Allow speech in the browser (Chrome/Edge), check system volume.
5. **Won’t start** — Port 5000 in use; set `PORT`. Confirm `pip install -r requirements.txt`.
6. **Image / HEIC errors** — Pillow and pillow-heif must be installed; processing falls back to the original file if optimization fails.
7. **PDF rejected** — Under 50MB, and not corrupted. There is no special handling for password-protected PDFs; they typically fail OCR.

More logging:

```bash
export FLASK_DEBUG=true
python app.py
```

## Deployment

`render.yaml` is set up for Render.com.

1. Connect the GitHub repo (or apply the Blueprint).
2. Set secrets in the service **Environment**: `GEMINI_API_KEY` (or `GOOGLE_SERVICE_ACCOUNT_JSON` + `GOOGLE_PROJECT` / `GOOGLE_LOCATION`) and `DEEPL_API_KEY`.
3. Deploy. Build runs `bash scripts/build.sh` (pip + DeepL locale sync). Start is `gunicorn app:app --timeout 300`.

`{{.GEMINI_API_KEY}}` and `{{.DEEPL_API_KEY}}` come from a Render Environment Group or service secrets, not from GitHub.

On other hosts: same build/start commands, and set those environment variables there.

## Credits

Engaging Reader is currently maintained by Jake Zaslav.

The site was originally developed by Jake Zaslav and Azhar Saidoo.

This project was made possible thanks to the support of [engAGE: Centre for Research on Aging](https://www.concordia.ca/research/aging.html) and the [Grace Dart Foundation](https://fondationgracedart.com).

Thank you to Mario and Ramsay: our first users, community partners, and visionaries.

## License

Engaging Reader is licensed under the [GNU General Public License v3.0](LICENSE).
