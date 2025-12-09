# Suno AI Browser Automation

A Node.js script using Playwright to automate song generation on [Suno AI](https://suno.com). 

**Features:**
- 🎵 **Automated Generation**: Inputs prompts and triggers generation automatically.
- 💾 **Auto-Download**: Waits for generation to complete and saves the MP3 to your local folder.
- 🍪 **Session Persistence**: Logs in once manually, then saves the session for future runs.
- 👻 **Headless Mode**: Option to run in the background so you can keep working while it generates.
- 📝 **Metadata Log**: Saves details of generated songs to `generated_songs.json`.

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher)
- A valid Suno.com account.

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/RohithAmalan/Sunoai-Browser-Use.git
   cd Sunoai-Browser-Use
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

Run the script:
```bash
node index.js
```

### First Run (Login)
1. The browser will open to the Suno Create page.
2. **Log in manually** using your preferred method.
3. The script will detect when you are logged in (status will appear in the terminal).
4. **Result**: Your session is saved to `auth.json`.

### Generating Music
1. Enter your song description when prompted in the terminal.
2. Select whether you want an Instrumental track (y/n).
3. The script will:
   - Enter your prompt.
   - Click Create.
   - Wait for the song to generate (1-2 minutes).
   - **Download the MP3** to the project folder.

### Background Mode
If you have already logged in (`auth.json` exists), the script will ask:
> Run in background (headless)? (y/n):

Type `y` to run it invisibly.

## Files
- `index.js`: Main CLI entry point.
- `suno_automation.js`: Playwright logic for browser interaction.
- `generated_songs.json`: Log file containing prompts and timestamps of your generations.
- `auth.json`: (Gitignored) Stores your sensitive session cookies. DO NOT SHARE THIS FILE.

## Disclaimer
This is an unofficial automation script. Use responsibly and in accordance with Suno AI's terms of service.
