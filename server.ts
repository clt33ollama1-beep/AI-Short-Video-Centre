import "dotenv/config";
import express from "express";
import fs from "node:fs";
import { createServer as createHttpServer } from "node:http";
import path from "node:path";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
app.use(express.json({ limit: "150mb" }));

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = import.meta.dirname;
const DATA_DIR = process.env.CINEFORGE_DATA_DIR || path.join(ROOT_DIR, "data");
const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");

function getAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "未偵測到 GEMINI_API_KEY。若於本機或 Docker 部署，請在 .env 或 -e 環境變數設定 GEMINI_API_KEY；若於 AI Studio 請至 Settings > Secrets 設定，或於右上角「引擎設定」切換為本地端模型。"
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("GEMINI_API_KEY") || raw.includes("API_KEY_INVALID") || raw.includes("400")) {
    if (raw.includes("API_KEY_INVALID")) {
      return {
        status: 400,
        message: "Gemini API 金鑰無效，請於 Settings > Secrets 檢查您的金鑰。",
      };
    }
  }
  if (raw.includes("PERMISSION_DENIED") || raw.includes("403")) {
    return {
      status: 403,
      message: "權限不足或此模型需要已啟用計費的付費 API 金鑰，請於 Settings > Secrets 確認。",
    };
  }
  if (raw.includes("RESOURCE_EXHAUSTED") || raw.includes("429")) {
    return {
      status: 429,
      message: "API 配額已達上限（429），請稍候重試或於 Settings > Secrets 切換至付費層級金鑰。",
    };
  }
  if (raw.includes("NOT_FOUND") || raw.includes("404")) {
    return {
      status: 404,
      message: `請求的 Gemini 模型不可用：${raw}`,
    };
  }
  return { status: 500, message: raw || "生成過程發生未知錯誤" };
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }
  // Also support reading generated static showcase assets safely from src/assets/images
  if (dataUrl.startsWith("/src/assets/images/")) {
    const fileName = path.basename(dataUrl);
    const fullPath = path.join(ROOT_DIR, "src", "assets", "images", fileName);
    if (fs.existsSync(fullPath)) {
      const buf = fs.readFileSync(fullPath);
      const ext = path.extname(fileName).toLowerCase();
      const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
      return { mimeType, data: buf.toString("base64") };
    }
  }
  return null;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasKey: Boolean(process.env.GEMINI_API_KEY) });
});

app.get("/api/projects", (_req, res) => {
  try {
    if (!fs.existsSync(PROJECTS_FILE)) {
      res.json({ projects: [], activeProjectId: "", updatedAt: 0 });
      return;
    }
    const raw = fs.readFileSync(PROJECTS_FILE, "utf8");
    const data = JSON.parse(raw);
    res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "讀取專案存檔失敗";
    res.status(500).json({ error: msg });
  }
});

app.put("/api/projects", (req, res) => {
  try {
    const { projects, activeProjectId, updatedAt } = req.body ?? {};
    if (!Array.isArray(projects)) {
      res.status(400).json({ error: "projects 必須為陣列" });
      return;
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmpFile = `${PROJECTS_FILE}.tmp`;
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({
        projects,
        activeProjectId: typeof activeProjectId === "string" ? activeProjectId : "",
        updatedAt: Number(updatedAt) || Date.now(),
      }),
      "utf8"
    );
    fs.renameSync(tmpFile, PROJECTS_FILE);
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "寫入專案存檔失敗";
    res.status(500).json({ error: msg });
  }
});

app.post("/api/director/script", async (req, res) => {
  try {
    const {
      premise,
      genre = "都市懸疑",
      visualStyle = "35mm 膠片寫實暗調",
      aspectRatio = "16:9",
      sceneCount = 4,
      dialogueMode = "dialogue",
    } = req.body ?? {};

    if (!premise || typeof premise !== "string" || !premise.trim()) {
      res.status(400).json({ error: "請輸入短劇靈感或故事主題。" });
      return;
    }

    const clampedCount = Math.min(6, Math.max(3, Number(sceneCount) || 4));
    const ai = getAI();

    const systemInstruction = [
      "You are an acclaimed short-drama director, screenwriter, and director of photography.",
      "Produce a tightly paced, emotionally cohesive short film production package in Traditional Chinese (繁體中文) for titles/dialogue/subtitles, while writing visualPrompt, videoMotionPrompt, and musicPrompt in vivid, production-ready English.",
      "Maintain strict character appearance, wardrobe, and lighting continuity across every scene's visualPrompt.",
      "Each scene's dialogueLine must be concise enough to speak naturally within its durationSec (around 12-28 Traditional Chinese characters for 5-7 seconds).",
      "Available TTS voiceName options: 'Puck' (warm male lead), 'Charon' (deep calm male/narrator), 'Kore' (clear expressive female), 'Fenrir' (intense dramatic male), 'Zephyr' (gentle poetic female/narrator).",
    ].join(" ");

    const userPrompt = [
      `創作主題：${premise.trim()}`,
      `題材類型：${genre}`,
      `視覺風格：${visualStyle}`,
      `畫面比例：${aspectRatio}`,
      `分場數量：${clampedCount} 場`,
      `對白形式：${dialogueMode === "narration" ? "第一人稱電影旁白獨白" : "雙角色張力對白與旁白交織"}`,
      "請設計完整的短劇片名、一句話故事大綱、導演視覺手記、主要角色與聲線設定、Lyria 原創配樂提示詞（純器樂、避免人聲歌詞以免干擾對白），以及每一場的鏡頭語言、英文生圖提示詞、英文動態運鏡提示詞、對白與環境音效提示。",
    ].join("\n");

    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "短劇片名（繁體中文）" },
            logline: { type: Type.STRING, description: "故事梗概（繁體中文）" },
            directorVision: { type: Type.STRING, description: "導演攝影美學與調色筆記（繁體中文）" },
            musicPrompt: {
              type: Type.STRING,
              description: "English instrumental score prompt for Lyria music generation, specifying tempo, instruments, and emotional arc, no vocals.",
            },
            characters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  role: { type: Type.STRING },
                  appearanceAnchor: { type: Type.STRING, description: "English wardrobe and appearance description for continuity" },
                  voiceName: { type: Type.STRING, description: "One of: Puck, Charon, Kore, Fenrir, Zephyr" },
                  voiceStyle: { type: Type.STRING, description: "Short tone direction for TTS" },
                },
                required: ["name", "role", "appearanceAnchor", "voiceName", "voiceStyle"],
              },
            },
            scenes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  sceneNumber: { type: Type.INTEGER },
                  title: { type: Type.STRING, description: "場次標題（繁體中文）" },
                  shotType: { type: Type.STRING, description: "鏡位與鏡頭焦段，例如：中景推鏡 · 35mm" },
                  durationSec: { type: Type.INTEGER, description: "本場秒數，建議 5 到 8 秒" },
                  motionEffect: { type: Type.STRING, description: "One of: zoom, pan, pull" },
                  visualPrompt: {
                    type: Type.STRING,
                    description: "Detailed English cinematic image prompt including lighting, environment, framing, character appearance, and no text.",
                  },
                  videoMotionPrompt: {
                    type: Type.STRING,
                    description: "English camera and subject movement prompt for animating this still frame into a video clip.",
                  },
                  speaker: { type: Type.STRING, description: "說話角色名或旁白" },
                  voiceName: { type: Type.STRING, description: "One of: Puck, Charon, Kore, Fenrir, Zephyr" },
                  voiceStyle: { type: Type.STRING, description: "Emotional delivery style instruction" },
                  dialogueLine: { type: Type.STRING, description: "角色對白或旁白台詞（繁體中文）" },
                  sfxCue: { type: Type.STRING, description: "環境音與動作音效提示（繁體中文）" },
                },
                required: [
                  "sceneNumber",
                  "title",
                  "shotType",
                  "durationSec",
                  "motionEffect",
                  "visualPrompt",
                  "videoMotionPrompt",
                  "speaker",
                  "voiceName",
                  "voiceStyle",
                  "dialogueLine",
                  "sfxCue",
                ],
              },
            },
          },
          required: ["title", "logline", "directorVision", "musicPrompt", "characters", "scenes"],
        },
      },
    });

    const jsonStr = (response.text ?? "{}").trim();
    const parsed = JSON.parse(jsonStr);
    res.json({ production: parsed });
  } catch (err) {
    const { status, message } = formatGeminiError(err);
    res.status(status).json({ error: message });
  }
});

app.post("/api/director/storyboard", async (req, res) => {
  try {
    const {
      prompt,
      aspectRatio = "16:9",
      highQuality = false,
      referenceImageDataUrl,
    } = req.body ?? {};

    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: "缺少分鏡視覺提示詞。" });
      return;
    }

    const ai = getAI();
    const model = highQuality ? "gemini-nano-banana-2.1" : "gemini-3.1-flash-lite-image";
    const validRatio = ["1:1", "3:4", "4:3", "9:16", "16:9"].includes(aspectRatio)
      ? aspectRatio
      : "16:9";

    const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
    if (typeof referenceImageDataUrl === "string" && referenceImageDataUrl) {
      const parsedRef = parseDataUrl(referenceImageDataUrl);
      if (parsedRef) {
        parts.push({
          inlineData: {
            data: parsedRef.data,
            mimeType: parsedRef.mimeType,
          },
        });
        parts.push({
          text: `Maintain visual continuity, color grading, and character style from the reference frame. Generate a new cinematic film still with no text or watermarks: ${prompt}`,
        });
      } else {
        parts.push({ text: `Cinematic film still, no text or watermarks: ${prompt}` });
      }
    } else {
      parts.push({ text: `Cinematic film still, no text or watermarks: ${prompt}` });
    }

    const response = await ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: validRatio,
          ...(highQuality ? { imageSize: "1K" } : {}),
        },
      },
    });

    let imageUrl = "";
    let mimeType = "image/png";
    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        mimeType = part.inlineData.mimeType ?? "image/png";
        imageUrl = `data:${mimeType};base64,${part.inlineData.data}`;
        break;
      }
    }

    if (!imageUrl) {
      res.status(502).json({ error: "模型未回傳影像資料，請調整提示詞後重試。" });
      return;
    }

    res.json({ imageUrl, mimeType, model });
  } catch (err) {
    const { status, message } = formatGeminiError(err);
    res.status(status).json({ error: message });
  }
});

app.post("/api/director/video", async (req, res) => {
  try {
    const {
      prompt,
      imageDataUrl,
      aspectRatio = "16:9",
      durationSec = 6,
    } = req.body ?? {};

    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: "缺少動態運鏡提示詞。" });
      return;
    }

    const ai = getAI();
    const validRatio = aspectRatio === "9:16" ? "9:16" : "16:9";
    const clampedDuration = Math.min(10, Math.max(3, Math.round(Number(durationSec) || 6)));

    const parsedImg = typeof imageDataUrl === "string" && imageDataUrl ? parseDataUrl(imageDataUrl) : null;
    const inputPayload = parsedImg
      ? [
          {
            type: "image" as const,
            mime_type: parsedImg.mimeType,
            data: parsedImg.data,
          },
          {
            type: "text" as const,
            text: prompt,
          },
        ]
      : prompt;

    const interaction = await ai.interactions.create(
      {
        model: "gemini-omni-1.2-flash",
        input: inputPayload,
        background: false,
        store: false,
        stream: false,
        response_format: {
          type: "video",
          aspect_ratio: validRatio,
          duration: `${clampedDuration}s`,
          resolution: "720p",
        },
      },
      { timeout: 300000 }
    );

    const videoPart = interaction.output_video;
    if (!videoPart?.data) {
      res.status(502).json({ error: "動態影像生成未回傳影片串流，請重試。" });
      return;
    }

    const mimeType = videoPart.mime_type || "video/mp4";
    const videoUrl = `data:${mimeType};base64,${videoPart.data}`;
    res.json({ videoUrl, mimeType });
  } catch (err) {
    const { status, message } = formatGeminiError(err);
    res.status(status).json({ error: message });
  }
});

app.post("/api/director/speech", async (req, res) => {
  try {
    const {
      text,
      voiceName = "Charon",
      voiceStyle = "Calm, cinematic film narration",
      expressive = true,
    } = req.body ?? {};

    if (!text || typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "缺少對白或旁白文字。" });
      return;
    }

    const validVoices = ["Puck", "Charon", "Kore", "Fenrir", "Zephyr"];
    const selectedVoice = validVoices.includes(voiceName) ? voiceName : "Charon";
    const model = expressive ? "gemini-3.8-flash-tts" : "gemini-3.8-flash-lite-tts";

    const ai = getAI();
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: text.trim(),
              speechMetadata: {
                style: voiceStyle,
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: selectedVoice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      res.status(502).json({ error: "語音模型未回傳音訊資料。" });
      return;
    }

    res.json({
      audioUrl: `data:audio/wav;base64,${base64Audio}`,
      mimeType: "audio/wav",
      voiceName: selectedVoice,
    });
  } catch (err) {
    const { status, message } = formatGeminiError(err);
    res.status(status).json({ error: message });
  }
});

app.post("/api/director/music", async (req, res) => {
  try {
    const {
      prompt,
      referenceImageDataUrl,
      proMode = false,
    } = req.body ?? {};

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      res.status(400).json({ error: "缺少配樂風格提示詞。" });
      return;
    }

    const ai = getAI();
    const model = proMode ? "lyria-3-pro-preview" : "lyria-3-clip-preview";

    const parsedImg =
      typeof referenceImageDataUrl === "string" && referenceImageDataUrl
        ? parseDataUrl(referenceImageDataUrl)
        : null;

    const contents = parsedImg
      ? {
          parts: [
            { text: prompt.trim() },
            { inlineData: { data: parsedImg.data, mimeType: parsedImg.mimeType } },
          ],
        }
      : prompt.trim();

    const response = await ai.models.generateContentStream({
      model,
      contents,
    });

    const audioChunks: Buffer[] = [];
    let lyrics = "";
    let mimeType = "audio/mpeg";

    for await (const chunk of response) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (!parts) continue;
      for (const part of parts) {
        if (part.inlineData?.data) {
          if (audioChunks.length === 0 && part.inlineData.mimeType) {
            mimeType = part.inlineData.mimeType;
          }
          audioChunks.push(Buffer.from(part.inlineData.data, "base64"));
        }
        if (part.text) {
          lyrics += part.text;
        }
      }
    }

    if (audioChunks.length === 0) {
      res.status(502).json({ error: "配樂模型未回傳音訊串流。" });
      return;
    }

    const audioBase64 = Buffer.concat(audioChunks).toString("base64");
    res.json({
      audioUrl: `data:${mimeType};base64,${audioBase64}`,
      lyrics,
      mimeType,
    });
  } catch (err) {
    const { status, message } = formatGeminiError(err);
    res.status(status).json({ error: message });
  }
});

function sanitizeBaseUrl(raw: unknown, fallback: string): string {
  const input = typeof raw === "string" && raw.trim() ? raw.trim() : fallback;
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error(`無效的本地端服務位址：${input}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("僅支援 http:// 或 https:// 本地端位址");
  }
  return input.replace(/\/+$/, "");
}

function buildLocalHeaders(token: unknown, includeJson = true): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }
  if (typeof token === "string" && token.trim()) {
    const raw = token.trim();
    headers.Authorization = raw.toLowerCase().startsWith("bearer ") ? raw : `Bearer ${raw}`;
  }
  return headers;
}

const OPENAI_DRAMA_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    logline: { type: "string" },
    directorVision: { type: "string" },
    musicPrompt: { type: "string" },
    characters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          role: { type: "string" },
          appearanceAnchor: { type: "string" },
          voiceName: { type: "string", enum: ["Puck", "Charon", "Kore", "Fenrir", "Zephyr"] },
          voiceStyle: { type: "string" },
        },
        required: ["name", "role", "appearanceAnchor", "voiceName", "voiceStyle"],
      },
    },
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sceneNumber: { type: "integer" },
          title: { type: "string" },
          shotType: { type: "string" },
          durationSec: { type: "integer" },
          motionEffect: { type: "string", enum: ["zoom", "pan", "pull"] },
          visualPrompt: { type: "string" },
          videoMotionPrompt: { type: "string" },
          speaker: { type: "string" },
          voiceName: { type: "string", enum: ["Puck", "Charon", "Kore", "Fenrir", "Zephyr"] },
          voiceStyle: { type: "string" },
          dialogueLine: { type: "string" },
          sfxCue: { type: "string" },
        },
        required: [
          "sceneNumber",
          "title",
          "shotType",
          "durationSec",
          "motionEffect",
          "visualPrompt",
          "videoMotionPrompt",
          "speaker",
          "voiceName",
          "voiceStyle",
          "dialogueLine",
          "sfxCue",
        ],
      },
    },
  },
  required: ["title", "logline", "directorVision", "musicPrompt", "characters", "scenes"],
};

function extractJsonFromModelText(raw: string): Record<string, unknown> {
  const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = withoutThink.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1].trim() : withoutThink;
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    const braceMatch = candidate.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      return JSON.parse(braceMatch[0]) as Record<string, unknown>;
    }
    throw new Error("本地語言模型未回傳有效的 JSON 劇本格式，請嘗試更換支援 JSON 的模型（如 qwen2.5、llama3.1、gemma3）。");
  }
}

app.post("/api/local/probe", async (req, res) => {
  try {
    const { kind, baseUrl, authToken } = req.body ?? {};
    const fallbackUrl =
      kind === "video"
        ? "http://127.0.0.1:8188"
        : kind === "a1111"
        ? "http://127.0.0.1:7860"
        : kind === "comfyui"
        ? "http://127.0.0.1:8188"
        : "http://127.0.0.1:11434";
    const url = sanitizeBaseUrl(baseUrl, fallbackUrl);
    const headers = buildLocalHeaders(authToken, false);

    if (kind === "ollama") {
      const resp = await fetch(`${url}/api/tags`, { headers, signal: AbortSignal.timeout(8000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as { models?: Array<{ name?: string; model?: string }> };
      const models = (data.models ?? []).map((m) => m.name || m.model || "").filter(Boolean);
      res.json({ ok: true, models, message: `已連線 Ollama，偵測到 ${models.length} 個本地模型` });
      return;
    }

    if (kind === "openai_compatible") {
      const target = url.endsWith("/v1") ? `${url}/models` : `${url}/v1/models`;
      const resp = await fetch(target, { headers, signal: AbortSignal.timeout(8000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as { data?: Array<{ id?: string }> };
      const models = (data.data ?? []).map((m) => m.id || "").filter(Boolean);
      res.json({ ok: true, models, message: `已連線 OpenAI 相容端點，偵測到 ${models.length} 個模型` });
      return;
    }

    if (kind === "a1111") {
      const resp = await fetch(`${url}/sdapi/v1/sd-models`, { headers, signal: AbortSignal.timeout(8000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as Array<{ title?: string; model_name?: string }>;
      const models = data.map((m) => m.title || m.model_name || "").filter(Boolean);
      res.json({ ok: true, models, message: `已連線 Automatic1111 / Forge，偵測到 ${models.length} 個權重` });
      return;
    }

    if (kind === "comfyui") {
      const resp = await fetch(`${url}/object_info/CheckpointLoaderSimple`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as {
        CheckpointLoaderSimple?: { input?: { required?: { ckpt_name?: [string[]] } } };
      };
      const models = data.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? [];
      res.json({ ok: true, models, message: `已連線 ComfyUI，偵測到 ${models.length} 個 Checkpoint` });
      return;
    }

    if (kind === "video") {
      const ping = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (ping.status === 401 || ping.status === 403) {
        throw new Error(`驗證失敗（HTTP ${ping.status}），請檢查 Bearer Token 是否正確`);
      }
      if (ping.status === 405) {
        res.json({
          ok: true,
          models: [],
          message: "已連線本地影片端點（伺服器回應 405，僅接受 POST 請求）",
        });
        return;
      }
      if (ping.status === 404) {
        const opt = await fetch(url, {
          method: "OPTIONS",
          headers,
          signal: AbortSignal.timeout(5000),
        }).catch(() => null);
        if (opt && (opt.ok || opt.status === 204)) {
          res.json({
            ok: true,
            models: [],
            message: "已連線本地影片端點（端點僅接受 POST / OPTIONS 請求）",
          });
          return;
        }
        throw new Error("HTTP 404（伺服器可連線，但找不到此端點路徑）");
      }
      if (!ping.ok) {
        throw new Error(`HTTP ${ping.status}`);
      }
      res.json({ ok: true, models: [], message: `已連線本地影片端點（HTTP ${ping.status}）` });
      return;
    }

    const ping = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    if (!ping.ok) throw new Error(`HTTP ${ping.status}`);
    res.json({ ok: true, models: [], message: `端點可連線（HTTP ${ping.status}）` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "無法連線至本地端模型服務";
    res.status(502).json({
      ok: false,
      models: [],
      error: `連線失敗（${msg}）。若此平台運行於雲端預覽環境，請使用「瀏覽器直連本機」模式並開啟本地端 CORS，或填入公開通道位址。`,
    });
  }
});

app.post("/api/local/script", async (req, res) => {
  try {
    const {
      premise,
      genre = "都市懸疑",
      visualStyle = "35mm 膠片寫實暗調",
      aspectRatio = "16:9",
      sceneCount = 4,
      dialogueMode = "dialogue",
      localConfig = {},
    } = req.body ?? {};

    if (!premise || typeof premise !== "string" || !premise.trim()) {
      res.status(400).json({ error: "請輸入短劇靈感或故事主題。" });
      return;
    }

    const llmProvider = localConfig.llmProvider === "openai_compatible" ? "openai_compatible" : "ollama";
    const baseUrl = sanitizeBaseUrl(localConfig.llmBaseUrl, "http://127.0.0.1:11434");
    const model = typeof localConfig.llmModel === "string" && localConfig.llmModel.trim()
      ? localConfig.llmModel.trim()
      : "qwen2.5:14b";
    const clampedCount = Math.min(6, Math.max(3, Number(sceneCount) || 4));

    const systemPrompt = [
      "You are an acclaimed short-drama director and cinematographer.",
      "Output ONLY a valid JSON object (no markdown commentary) with keys:",
      "title (string, Traditional Chinese), logline (string, Traditional Chinese), directorVision (string, Traditional Chinese), musicPrompt (string, English instrumental score prompt),",
      "characters (array of { name, role, appearanceAnchor, voiceName, voiceStyle } where voiceName is one of Puck, Charon, Kore, Fenrir, Zephyr),",
      `scenes (array of exactly ${clampedCount} objects with: sceneNumber, title, shotType, durationSec (5-8), motionEffect ('zoom'|'pan'|'pull'), visualPrompt (English), videoMotionPrompt (English), speaker, voiceName, voiceStyle, dialogueLine (Traditional Chinese), sfxCue (Traditional Chinese)).`,
    ].join(" ");

    const userPrompt = [
      `創作主題：${premise.trim()}`,
      `題材類型：${genre}`,
      `視覺風格：${visualStyle}`,
      `畫面比例：${aspectRatio}`,
      `分場數量：${clampedCount} 場`,
      `對白形式：${dialogueMode === "narration" ? "第一人稱電影旁白獨白" : "雙角色張力對白"}`,
      "請確保 JSON 結構完整且 visualPrompt 維持一致的角色外觀與光影描述。",
    ].join("\n");

    let rawText = "";
    const llmHeaders = buildLocalHeaders(localConfig.llmAuthToken, true);
    if (llmProvider === "ollama") {
      const resp = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: llmHeaders,
        signal: AbortSignal.timeout(300000),
        body: JSON.stringify({
          model,
          format: "json",
          stream: false,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      if (!resp.ok) {
        const errBody = await resp.text();
        throw new Error(`Ollama 回應錯誤 (${resp.status}): ${errBody}`);
      }
      const data = (await resp.json()) as { message?: { content?: string } };
      rawText = data.message?.content ?? "";
    } else {
      const endpoint = baseUrl.endsWith("/v1")
        ? `${baseUrl}/chat/completions`
        : `${baseUrl}/v1/chat/completions`;
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];

      const formatCandidates: Array<Record<string, unknown> | undefined> = [
        { type: "json_object" },
        {
          type: "json_schema",
          json_schema: {
            name: "drama_production",
            strict: true,
            schema: OPENAI_DRAMA_JSON_SCHEMA,
          },
        },
        undefined,
      ];

      let resp: Response | null = null;
      let lastErrBody = "";
      for (const responseFormat of formatCandidates) {
        const bodyPayload: Record<string, unknown> = {
          model,
          messages,
          ...(responseFormat ? { response_format: responseFormat } : {}),
        };
        resp = await fetch(endpoint, {
          method: "POST",
          headers: llmHeaders,
          signal: AbortSignal.timeout(300000),
          body: JSON.stringify(bodyPayload),
        });
        if (resp.ok) break;
        lastErrBody = await resp.text();
        if (
          resp.status === 400 &&
          (lastErrBody.includes("response_format") ||
            lastErrBody.includes("json_schema") ||
            lastErrBody.includes("json_object"))
        ) {
          continue;
        }
        throw new Error(`本地 OpenAI 相容端點錯誤 (${resp.status}): ${lastErrBody}`);
      }

      if (!resp || !resp.ok) {
        throw new Error(
          `本地 OpenAI 相容端點錯誤 (${resp?.status ?? 502}): ${lastErrBody}`
        );
      }
      const data = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
      };
      rawText =
        data.choices?.[0]?.message?.content ||
        data.choices?.[0]?.message?.reasoning_content ||
        "";
    }

    const parsed = extractJsonFromModelText(rawText);
    res.json({ production: parsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "本地劇本生成失敗";
    res.status(502).json({ error: msg });
  }
});

app.post("/api/local/storyboard", async (req, res) => {
  try {
    const {
      prompt,
      aspectRatio = "16:9",
      referenceImageDataUrl,
      localConfig = {},
    } = req.body ?? {};

    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: "缺少分鏡視覺提示詞。" });
      return;
    }

    const provider = localConfig.imageProvider || "a1111";
    const baseUrl = sanitizeBaseUrl(localConfig.imageBaseUrl, "http://127.0.0.1:7860");
    const imageModel = typeof localConfig.imageModel === "string" ? localConfig.imageModel.trim() : "";
    const imageHeaders = buildLocalHeaders(localConfig.imageAuthToken, true);
    const imageGetHeaders = buildLocalHeaders(localConfig.imageAuthToken, false);
    const width = aspectRatio === "9:16" ? 576 : 1024;
    const height = aspectRatio === "9:16" ? 1024 : 576;

    if (provider === "a1111") {
      const parsedRef =
        typeof referenceImageDataUrl === "string" && referenceImageDataUrl
          ? parseDataUrl(referenceImageDataUrl)
          : null;

      const endpoint = parsedRef ? `${baseUrl}/sdapi/v1/img2img` : `${baseUrl}/sdapi/v1/txt2img`;
      const payload: Record<string, unknown> = {
        prompt: `${prompt}, cinematic film still, ultra detailed, 35mm`,
        negative_prompt: "text, watermark, subtitle, logo, blurry, deformed",
        width,
        height,
        steps: 24,
        cfg_scale: 7,
        ...(parsedRef
          ? { init_images: [parsedRef.data], denoising_strength: 0.68 }
          : {}),
        ...(imageModel
          ? { override_settings: { sd_model_checkpoint: imageModel } }
          : {}),
      };

      const resp = await fetch(endpoint, {
        method: "POST",
        headers: imageHeaders,
        signal: AbortSignal.timeout(180000),
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        throw new Error(`Automatic1111 回應錯誤 (${resp.status}): ${await resp.text()}`);
      }
      const data = (await resp.json()) as { images?: string[] };
      const b64 = data.images?.[0];
      if (!b64) throw new Error("Automatic1111 未回傳影像");
      res.json({
        imageUrl: `data:image/png;base64,${b64}`,
        mimeType: "image/png",
        model: imageModel || "a1111",
      });
      return;
    }

    if (provider === "comfyui") {
      let ckpt = imageModel;
      if (!ckpt) {
        const infoResp = await fetch(`${baseUrl}/object_info/CheckpointLoaderSimple`, {
          headers: imageGetHeaders,
          signal: AbortSignal.timeout(8000),
        });
        if (infoResp.ok) {
          const infoData = (await infoResp.json()) as {
            CheckpointLoaderSimple?: { input?: { required?: { ckpt_name?: [string[]] } } };
          };
          ckpt = infoData.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0]?.[0] ?? "";
        }
      }
      if (!ckpt) {
        throw new Error("ComfyUI 未偵測到可用的 Checkpoint 模型，請於設定指定模型檔名。");
      }

      const workflow = {
        "3": {
          class_type: "KSampler",
          inputs: {
            seed: Math.floor(Math.random() * 1_000_000_000),
            steps: 22,
            cfg: 7,
            sampler_name: "euler",
            scheduler: "normal",
            denoise: 1,
            model: ["4", 0],
            positive: ["6", 0],
            negative: ["7", 0],
            latent_image: ["5", 0],
          },
        },
        "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: ckpt } },
        "5": { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 } },
        "6": {
          class_type: "CLIPTextEncode",
          inputs: { text: `${prompt}, cinematic film still`, clip: ["4", 1] },
        },
        "7": {
          class_type: "CLIPTextEncode",
          inputs: { text: "text, watermark, subtitle, blurry", clip: ["4", 1] },
        },
        "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
        "9": { class_type: "SaveImage", inputs: { filename_prefix: "cineforge", images: ["8", 0] } },
      };

      const queueResp = await fetch(`${baseUrl}/prompt`, {
        method: "POST",
        headers: imageHeaders,
        body: JSON.stringify({ prompt: workflow }),
      });
      if (!queueResp.ok) {
        throw new Error(`ComfyUI 排程失敗 (${queueResp.status}): ${await queueResp.text()}`);
      }
      const { prompt_id } = (await queueResp.json()) as { prompt_id: string };

      let outputImage: { filename: string; subfolder: string; type: string } | null = null;
      const deadline = Date.now() + 300000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        const histResp = await fetch(`${baseUrl}/history/${prompt_id}`, { headers: imageGetHeaders });
        if (!histResp.ok) continue;
        const hist = (await histResp.json()) as Record<
          string,
          {
            status?: {
              status_str?: string;
              completed?: boolean;
              messages?: Array<[string, Record<string, unknown>]>;
            };
            outputs?: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>;
          }
        >;
        const entry = hist[prompt_id];
        if (entry?.status?.status_str === "error") {
          const execErr = entry.status.messages?.find((m) => m[0] === "execution_error")?.[1];
          const nodeType = execErr?.node_type ? String(execErr.node_type) : "ComfyUI";
          const detail = execErr?.exception_message
            ? String(execErr.exception_message).trim()
            : "工作流程執行發生錯誤";
          throw new Error(`ComfyUI 算圖失敗（${nodeType}）：${detail}`);
        }
        const firstImg =
          entry?.outputs?.["9"]?.images?.[0] ??
          Object.values(entry?.outputs ?? {}).find((o) => o.images && o.images.length > 0)?.images?.[0];
        if (firstImg) {
          outputImage = firstImg;
          break;
        }
      }

      if (!outputImage) {
        let queueHint = "";
        try {
          const qResp = await fetch(`${baseUrl}/queue`, {
            headers: imageGetHeaders,
            signal: AbortSignal.timeout(4000),
          });
          if (qResp.ok) {
            const qData = (await qResp.json()) as {
              queue_running?: unknown[];
              queue_pending?: unknown[];
            };
            const running = qData.queue_running?.length ?? 0;
            const pending = qData.queue_pending?.length ?? 0;
            queueHint = `（目前佇列：執行中 ${running} 筆、等待中 ${pending} 筆，prompt_id=${prompt_id}）`;
          }
        } catch {
          // ignore queue inspection errors
        }
        throw new Error(
          `ComfyUI 算圖逾時（已等待 300 秒）${queueHint}。請檢查 ComfyUI 終端機進度或至「分鏡導演室」個別繪製未完成場次。`
        );
      }
      const viewUrl = `${baseUrl}/view?filename=${encodeURIComponent(
        outputImage.filename
      )}&subfolder=${encodeURIComponent(outputImage.subfolder)}&type=${encodeURIComponent(
        outputImage.type
      )}`;
      const imgResp = await fetch(viewUrl, { headers: imageGetHeaders });
      const buf = Buffer.from(await imgResp.arrayBuffer());
      res.json({
        imageUrl: `data:image/png;base64,${buf.toString("base64")}`,
        mimeType: "image/png",
        model: ckpt,
      });
      return;
    }

    // OpenAI-compatible Images API
    const endpoint = baseUrl.endsWith("/v1")
      ? `${baseUrl}/images/generations`
      : `${baseUrl}/v1/images/generations`;
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: imageHeaders,
      signal: AbortSignal.timeout(180000),
      body: JSON.stringify({
        model: imageModel || "flux",
        prompt,
        size: aspectRatio === "9:16" ? "576x1024" : "1024x576",
        response_format: "b64_json",
      }),
    });
    if (!resp.ok) {
      throw new Error(`本地影像端點錯誤 (${resp.status}): ${await resp.text()}`);
    }
    const data = (await resp.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const item = data.data?.[0];
    const imageUrl = item?.b64_json
      ? `data:image/png;base64,${item.b64_json}`
      : item?.url || "";
    if (!imageUrl) throw new Error("本地影像端點未回傳圖片");
    res.json({ imageUrl, mimeType: "image/png", model: imageModel || "local-image" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "本地分鏡繪製失敗";
    res.status(502).json({ error: msg });
  }
});

app.post("/api/local/video", async (req, res) => {
  try {
    const { prompt, imageDataUrl, aspectRatio = "16:9", durationSec = 6, localConfig = {} } =
      req.body ?? {};
    const baseUrl = sanitizeBaseUrl(localConfig.videoBaseUrl, "http://127.0.0.1:8188");

    const resp = await fetch(baseUrl, {
      method: "POST",
      headers: buildLocalHeaders(localConfig.videoAuthToken, true),
      signal: AbortSignal.timeout(300000),
      body: JSON.stringify({ prompt, imageDataUrl, aspectRatio, durationSec }),
    });
    if (!resp.ok) {
      throw new Error(`本地影片服務錯誤 (${resp.status}): ${await resp.text()}`);
    }
    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("video/")) {
      const buf = Buffer.from(await resp.arrayBuffer());
      res.json({ videoUrl: `data:${contentType};base64,${buf.toString("base64")}`, mimeType: contentType });
      return;
    }
    const json = (await resp.json()) as { videoUrl?: string; data?: string; mimeType?: string };
    const videoUrl =
      json.videoUrl || (json.data ? `data:${json.mimeType || "video/mp4"};base64,${json.data}` : "");
    if (!videoUrl) throw new Error("本地影片端點未回傳 videoUrl 或 base64 影片資料");
    res.json({ videoUrl, mimeType: json.mimeType || "video/mp4" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "本地動態影片生成失敗";
    res.status(502).json({ error: msg });
  }
});

app.post("/api/local/speech", async (req, res) => {
  try {
    const { text, voiceName, localConfig = {} } = req.body ?? {};
    if (!text || typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "缺少配音文字。" });
      return;
    }
    const baseUrl = sanitizeBaseUrl(localConfig.ttsBaseUrl, "http://127.0.0.1:8880");
    const endpoint = baseUrl.endsWith("/v1")
      ? `${baseUrl}/audio/speech`
      : baseUrl.endsWith("/audio/speech")
      ? baseUrl
      : `${baseUrl}/v1/audio/speech`;

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: buildLocalHeaders(localConfig.ttsAuthToken, true),
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model: localConfig.ttsModel || "kokoro",
        input: text.trim(),
        voice: localConfig.ttsVoice || voiceName || "zf_xiaoxiao",
        response_format: "wav",
      }),
    });
    if (!resp.ok) {
      throw new Error(`本地語音服務錯誤 (${resp.status}): ${await resp.text()}`);
    }
    const mimeType = resp.headers.get("content-type")?.split(";")[0] || "audio/wav";
    const buf = Buffer.from(await resp.arrayBuffer());
    res.json({
      audioUrl: `data:${mimeType};base64,${buf.toString("base64")}`,
      mimeType,
      voiceName: localConfig.ttsVoice || voiceName || "local",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "本地語音合成失敗";
    res.status(502).json({ error: msg });
  }
});

app.post("/api/local/music", async (req, res) => {
  try {
    const { prompt, localConfig = {} } = req.body ?? {};
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      res.status(400).json({ error: "缺少配樂提示詞。" });
      return;
    }
    const baseUrl = sanitizeBaseUrl(localConfig.musicBaseUrl, "http://127.0.0.1:8000");
    const resp = await fetch(baseUrl, {
      method: "POST",
      headers: buildLocalHeaders(localConfig.musicAuthToken, true),
      signal: AbortSignal.timeout(180000),
      body: JSON.stringify({ prompt: prompt.trim(), duration: 30 }),
    });
    if (!resp.ok) {
      throw new Error(`本地配樂服務錯誤 (${resp.status}): ${await resp.text()}`);
    }
    const contentType = resp.headers.get("content-type")?.split(";")[0] || "";
    if (contentType.startsWith("audio/")) {
      const buf = Buffer.from(await resp.arrayBuffer());
      res.json({ audioUrl: `data:${contentType};base64,${buf.toString("base64")}`, lyrics: "", mimeType: contentType });
      return;
    }
    const data = (await resp.json()) as { audioUrl?: string; data?: string; mimeType?: string };
    const audioUrl =
      data.audioUrl || (data.data ? `data:${data.mimeType || "audio/wav"};base64,${data.data}` : "");
    if (!audioUrl) throw new Error("本地配樂端點未回傳音訊資料");
    res.json({ audioUrl, lyrics: "", mimeType: data.mimeType || "audio/wav" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "本地配樂生成失敗";
    res.status(502).json({ error: msg });
  }
});

async function startServer() {
  const httpServer = createHttpServer(app);
  httpServer.requestTimeout = 600000;

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const hmrConfig =
      process.env.DISABLE_HMR === "true" ? false : { server: httpServer };
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrConfig,
        ws: { server: httpServer },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(ROOT_DIR, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`CineForge AI Director running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
