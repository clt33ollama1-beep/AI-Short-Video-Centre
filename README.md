# CineForge Studio — AI 影音短劇自動化導演平台

**CineForge Studio** is a full-stack AI short-drama production platform powered by the `@google/genai` SDK. It connects screenplay breakdown, style-consistent storyboard illustration, Omni video animation, character voice acting (TTS), and original film scoring (Lyria) into a single synchronized screening room and multi-track timeline—with real-time `.webm` film export and Markdown production bible download.

**CineForge Studio** 是一套結合多模態 Gemini 模型的全端 AI 影音短劇自動化製片平台。從一句故事靈感出發，系統能自動完成「劇本編導拆解 → 角色連戲分鏡繪製 → 角色對白配音 → Lyria 原創配樂 → Omni 動態影像化」，並於放映廳同步混音播放與渲染匯出 `.webm` 成片。

---

## Key Capabilities / 核心功能

- **Automated Director Pipeline (`POST /api/director/script`)**
  Uses `gemini-4-hydrogen` with structured JSON schema output to generate the drama title, logline, cinematographer's notes, character voice profiles, Lyria instrumental score prompt, and shot-by-shot scene breakdowns.
- **Continuity-Aware Storyboards (`POST /api/director/storyboard`)**
  Uses `gemini-3.1-flash-lite-image` (or `gemini-nano-banana-2.1` for 1K high-detail frames) to render `16:9` widescreen or `9:16` vertical short-drama keyframes, passing Scene 1 as a visual anchor for subsequent scenes.
- **Image-to-Video Cinema Clips (`POST /api/director/video`)**
  Uses `gemini-omni-1.2-flash` via the Gemini Interactions API (`ai.interactions.create`) to animate storyboard frames into `720p` MP4 motion clips (`3s–10s`).
- **Expressive Character & Narrator TTS (`POST /api/director/speech`)**
  Uses `gemini-3.8-flash-tts` / `gemini-3.8-flash-lite-tts` with `speechMetadata` style direction and 5 prebuilt voices (`Puck`, `Charon`, `Kore`, `Fenrir`, `Zephyr`) returning 24kHz WAV tracks.
- **Original Film Scoring (`POST /api/director/music`)**
  Uses `lyria-3-clip-preview` (or `lyria-3-pro-preview`) conditioned on both the musical prompt and the opening frame to stream an MP3 score, automatically ducking background volume when dialogue plays.
- **Cohesive Screening Room & Export**
  - **成片放映廳 (Screening Room)**: Synchronizes video/Ken Burns motion, subtitles, optional `2.39:1` letterbox bars, voiceovers, and background music.
  - **分鏡導演室 (Storyboard Studio)**: Edit dialogue, voice style, camera prompts, duration, or regenerate individual frames, videos, and voices.
  - **多軌時間軸 (NLE Timeline)**: Visualizes `V1` (Visuals), `A1` (Dialogue WAV), and `A2` (Lyria Score) tracks with interactive playhead scrubbing.
  - **One-Click Exports**: Render and download a mixed `.webm` video file (`canvas.captureStream` + `MediaRecorder` + Web Audio) or export the complete Markdown production bible (`_分鏡劇本手冊.md`).

---

## Project Structure / 專案架構

```text
.
├── server.ts                        # Express + Vite server & server-side @google/genai API routes
├── index.html                       # Entry HTML & Google Fonts (Outfit, Plus Jakarta Sans, JetBrains Mono)
├── package.json                     # Scripts (dev, build, start, lint) & dependencies
├── metadata.json                    # App metadata & server-side Gemini capability declaration
├── TUTORIAL.md                      # Step-by-step production walkthrough & tips
└── src/
    ├── App.tsx                      # Main workspace, pipeline orchestration & Script Sheet view
    ├── index.css                    # Tailwind CSS v4 theme & Ken Burns cinema motion keyframes
    ├── types/director.ts            # TypeScript models for DramaProject, DramaScene & PipelineProgress
    ├── data/showcaseProject.ts      # Pre-loaded showcase ("第七號月台的信號") & starter presets
    ├── utils/
    │   ├── api.ts                   # Typed client fetch wrappers for /api/director/*
    │   └── exportProduction.ts      # Markdown bible exporter & real-time WebM canvas+audio renderer
    ├── assets/images/               # Pre-generated showcase cinema stills
    └── components/
        ├── ScreeningPlayer.tsx      # Synchronized cinema theater & audio-ducking player
        ├── StoryboardBoard.tsx      # Shot grid & per-scene director prompt/voice inspector
        ├── TimelineEditor.tsx       # 3-track NLE timeline & Lyria score editor
        ├── CreationStudioModal.tsx  # New short drama briefing wizard
        └── LocalModelModal.tsx      # Hybrid / Local model engine settings (Ollama, A1111, ComfyUI, TTS)
```

---

## Local & Hybrid Model Support / 本地與混合模型支援

Click **「引擎：Gemini 雲端 / 本地」** in the workspace bar to switch all 5 modalities—or mix Gemini and local models per stage:

- **Script LLM**: Ollama (`/api/chat`) or OpenAI-compatible servers (LM Studio, vLLM, llama.cpp) with automatic model discovery.
- **Storyboard Images**: Automatic1111 / Forge (`/sdapi/v1/txt2img`, `img2img`), ComfyUI (`/prompt`), or OpenAI-compatible `/v1/images/generations`.
- **Video Motion**: Custom local HTTP video endpoint (`POST` JSON).
- **Voiceover / TTS**: Browser offline Web Speech synthesis (zero-server) or local OpenAI-compatible TTS servers (e.g., Kokoro-FastAPI `/v1/audio/speech`).
- **Music Score**: Built-in Web Audio API `OfflineAudioContext` procedural 30s WAV score synthesizer (zero-server) or local MusicGen/ACE-Step HTTP endpoint.
- **Routing Mode**: Choose **Server Proxy** (when running locally via `npm run dev`) or **Browser Direct** (to connect directly to `127.0.0.1` from a hosted preview with CORS enabled, e.g. `OLLAMA_ORIGINS="*" ollama serve`).

---

## Environment Setup / 環境設定

1. **API Key**: Set `GEMINI_API_KEY` in your environment (or AI Studio **Settings > Secrets**) when using Gemini cloud models.
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Run Development Server** (Express + Vite middleware on port `3000`):
   ```bash
   npm run dev
   ```
4. **Type-Check & Production Build**:
   ```bash
   npm run lint
   npm run build
   npm start
   ```

---

## Docker Deployment / 容器化部署

The repository includes a multi-stage `Dockerfile`, `.dockerignore`, and `docker-compose.yml` running Node 22 in production mode with `/api/health` checks and `host.docker.internal` mapping.

### Option 1: Docker Compose (Recommended)

```bash
export GEMINI_API_KEY="your_api_key_here"   # Optional if using local models only
docker compose up -d --build
```

Open `http://localhost:3000`.

### Option 2: Direct Docker Build & Run

```bash
docker build -t cineforge-studio .
docker run -d \
  --name cineforge-studio \
  -p 3000:3000 \
  --add-host=host.docker.internal:host-gateway \
  -e GEMINI_API_KEY="your_api_key_here" \
  cineforge-studio
```

### Connecting Docker to Host Local Models

When CineForge runs inside a container and your local AI servers (Ollama, Automatic1111, ComfyUI, Kokoro TTS) run on the host machine:
- Use `http://host.docker.internal:11434` (Ollama), `http://host.docker.internal:7860` (A1111), `http://host.docker.internal:8188` (ComfyUI), or `http://host.docker.internal:8880` (Local TTS) in **「引擎設定 → 後端伺服器代理」**.
- Ensure host services bind to `0.0.0.0` (e.g., `OLLAMA_HOST=0.0.0.0 ollama serve`).

---

## API Endpoints / 後端 API 端點

| Method | Endpoint | Engine / Model | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | — | Verify server status and `GEMINI_API_KEY` availability |
| `POST` | `/api/director/script` | `gemini-4-hydrogen` | Generate structured script, characters, shots, and music prompt |
| `POST` | `/api/director/storyboard` | `gemini-3.1-flash-lite-image` / `gemini-nano-banana-2.1` | Generate storyboard keyframe image (with optional reference frame) |
| `POST` | `/api/director/video` | `gemini-omni-1.2-flash` | Animate still frame or text prompt into 720p MP4 video clip |
| `POST` | `/api/director/speech` | `gemini-3.8-flash-tts` / `gemini-3.8-flash-lite-tts` | Synthesize character/narrator WAV speech with `speechMetadata` |
| `POST` | `/api/director/music` | `lyria-3-clip-preview` / `lyria-3-pro-preview` | Stream original MP3 film score |
| `POST` | `/api/local/probe` | Ollama / LM Studio / A1111 / ComfyUI | Test connectivity and auto-discover installed local models |
| `POST` | `/api/local/script` | Ollama / OpenAI-compatible LLM | Generate structured drama script via local LLM |
| `POST` | `/api/local/storyboard` | A1111 / ComfyUI / OpenAI-compatible | Generate storyboard keyframes via local image engine |
| `POST` | `/api/local/video` | Local HTTP Video Endpoint | Generate motion clips via local video server |
| `POST` | `/api/local/speech` | Kokoro / Local OpenAI TTS | Synthesize character speech via local TTS server |
| `POST` | `/api/local/music` | Local Music HTTP Endpoint | Generate soundtrack via local music server |
