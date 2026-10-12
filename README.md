# Habit Grove

A responsive habit-tracker website built with Python, Flask, SQLite, and the
Google Gemini API. Habits and check-ins are saved in a local SQLite database.
Gemini can suggest a small habit plan for a goal and provide a personal check-in
based on recent progress.
You can also upload a photo and ask Gemini to identify a possible habit, explain
its general importance, and suggest one small first step.

## Run locally

1. Use Python 3.10 or newer.
2. Create and activate a virtual environment:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

3. Install dependencies:

   ```powershell
   pip install -r requirements.txt
   ```

4. Create `.env` from `.env.example` if it does not already exist, then replace
   the `GEMINI_API_KEY` placeholder with your key. Get a key from
   [Google AI Studio](https://aistudio.google.com/app/apikey). Keep `.env`
   private; it is excluded from Git.

   ```powershell
   if (-not (Test-Path .env)) { Copy-Item .env.example .env }
   notepad .env
   ```

5. Start the website:

   ```powershell
   python app.py
   ```

6. Open http://127.0.0.1:5000.

The habit tracker works without a Gemini key; the AI plan and coaching tools
require `GEMINI_API_KEY`. The key stays on the server and is never sent to the
browser. Habit data is stored in `instance/habits.db`. When you request an AI
check-in, habit names and recent completion counts are sent to Google's Gemini
API to generate the response; AI-generated habit plans send only the goal you
enter. Image insights send the selected photo and optional note to Gemini; the
app does not save the image. Supported image formats are PNG, JPEG, GIF, and
WebP, up to 5 MB.
If an AI feature reports that Gemini is not configured, check that the
placeholder in `.env` was replaced with a valid API key, then restart the app.

## Configuration

- `GEMINI_API_KEY`: API key from Google AI Studio (required for AI features).
- `GEMINI_MODEL`: Gemini model identifier; defaults to `gemini-2.5-flash`.
- `GEMINI_IMAGE_MODEL`: Gemini model for photo insights; defaults to
  `gemini-3.1-flash-lite`.
- `PORT`: local web server port; defaults to `5000`.
- `DATABASE_PATH`: optional SQLite database path; defaults to `instance/habits.db`.
