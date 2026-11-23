import type { AspectRatio, EnginePreferences, LocalModelConfig } from "../types/director";

const STORAGE_KEY = "cineforge_engine_preferences_v1";

export const DEFAULT_LOCAL_CONFIG: LocalModelConfig = {
  transportMode: "server",
  llmProvider: "ollama",
  llmBaseUrl: "http://127.0.0.1:11434",
  llmModel: "qwen2.5:14b",
  llmAuthToken: "",
  imageProvider: "a1111",
  imageBaseUrl: "http://127.0.0.1:7860",
  imageModel: "",
  imageAuthToken: "",
  videoProvider: "custom_http",
  videoBaseUrl: "http://127.0.0.1:8188",
  videoAuthToken: "",
  ttsProvider: "browser_speech",
  ttsBaseUrl: "http://127.0.0.1:8880",
  ttsModel: "kokoro",
  ttsVoice: "zf_xiaoxiao",
  ttsAuthToken: "",
  musicProvider: "local_synth",
  musicBaseUrl: "http://127.0.0.1:8000",
  musicAuthToken: "",
};

export const DEFAULT_ENGINE_PREFERENCES: EnginePreferences = {
  scriptProvider: "gemini",
  imageProvider: "gemini",
  videoProvider: "gemini",
  speechProvider: "gemini",
  musicProvider: "gemini",
  local: DEFAULT_LOCAL_CONFIG,
};

export function loadEnginePreferences(): EnginePreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ENGINE_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<EnginePreferences>;
    return {
      ...DEFAULT_ENGINE_PREFERENCES,
      ...parsed,
      local: {
        ...DEFAULT_LOCAL_CONFIG,
        ...(parsed.local ?? {}),
      },
    };
  } catch {
    return DEFAULT_ENGINE_PREFERENCES;
  }
}

export function saveEnginePreferences(prefs: EnginePreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage quota errors
  }
}

export function extractJsonFromText(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    const braceMatch = candidate.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      return JSON.parse(braceMatch[0]) as Record<string, unknown>;
    }
    throw new Error("本地模型未回傳有效的 JSON 劇本結構");
  }
}

function encodeWavFromAudioBuffer(buffer: AudioBuffer): string {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  const bytes = new Uint8Array(wavBuffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/**
 * Generates a 30-second offline cinematic ambient score WAV using Web Audio API
 * so local mode produces real exportable music without external dependencies.
 */
export async function synthesizeLocalCinemaScore(prompt: string): Promise<string> {
  const sampleRate = 24000;
  const durationSec = 30;
  const offline = new OfflineAudioContext(2, sampleRate * durationSec, sampleRate);

  const lower = prompt.toLowerCase();
  const isUpbeat = lower.includes("hopeful") || lower.includes("bright") || lower.includes("warm");
  const isTense = lower.includes("tense") || lower.includes("thriller") || lower.includes("dark");

  const bpm = isTense ? 84 : isUpbeat ? 76 : 64;
  const beatSec = 60 / bpm;

  // Chord progressions (Hz)
  const chords = isUpbeat
    ? [
        [220.0, 277.18, 329.63, 415.3], // Amaj7
        [196.0, 246.94, 293.66, 369.99], // Gmaj7
        [174.61, 220.0, 261.63, 329.63], // Fmaj7
        [164.81, 196.0, 246.94, 293.66], // Em7
      ]
    : isTense
    ? [
        [146.83, 174.61, 220.0, 277.18], // Dm(maj7)
        [130.81, 155.56, 196.0, 246.94], // Cm(maj7)
        [116.54, 146.83, 174.61, 220.0], // Bbmaj7
        [110.0, 138.59, 164.81, 207.65], // A7alt feel
      ]
    : [
        [146.83, 174.61, 220.0, 261.63], // Dm7
        [116.54, 146.83, 174.61, 220.0], // Bbmaj7
        [130.81, 164.81, 196.0, 246.94], // Cmaj7
        [110.0, 130.81, 164.81, 196.0], // Am7
      ];

  const master = offline.createGain();
  master.gain.setValueAtTime(0.01, 0);
  master.gain.linearRampToValueAtTime(0.65, 2.0);
  master.gain.setValueAtTime(0.65, durationSec - 3.0);
  master.gain.linearRampToValueAtTime(0.001, durationSec);
  master.connect(offline.destination);

  const lowpass = offline.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 1650;
  lowpass.connect(master);

  // Subtle ambient air / rain noise bed
  const noiseBuffer = offline.createBuffer(1, sampleRate * durationSec, sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) {
    noiseData[i] = (Math.random() * 2 - 1) * 0.04;
  }
  const noiseSrc = offline.createBufferSource();
  noiseSrc.buffer = noiseBuffer;
  const noiseFilter = offline.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 900;
  noiseFilter.Q.value = 0.7;
  const noiseGain = offline.createGain();
  noiseGain.gain.value = 0.25;
  noiseSrc.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);
  noiseSrc.start(0);

  // Lush string / cello pad + felt piano notes
  const barSec = beatSec * 4;
  const numBars = Math.ceil(durationSec / barSec);

  for (let bar = 0; bar < numBars; bar++) {
    const t0 = bar * barSec;
    if (t0 >= durationSec) break;
    const chord = chords[bar % chords.length];

    // Pad voices (bass + upper voices)
    chord.forEach((freq, idx) => {
      const osc = offline.createOscillator();
      osc.type = idx === 0 ? "sawtooth" : "triangle";
      osc.frequency.value = idx === 0 ? freq * 0.5 : freq;
      osc.detune.value = (idx % 2 === 0 ? 1 : -1) * 4;

      const gain = offline.createGain();
      const peak = idx === 0 ? 0.14 : 0.075;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(peak, t0 + 0.8);
      gain.gain.setValueAtTime(peak, Math.min(durationSec, t0 + barSec - 0.6));
      gain.gain.exponentialRampToValueAtTime(0.0001, Math.min(durationSec, t0 + barSec + 0.2));

      osc.connect(gain);
      gain.connect(lowpass);
      osc.start(t0);
      osc.stop(Math.min(durationSec, t0 + barSec + 0.25));
    });

    // Sparse felt-piano motif
    for (let step = 0; step < 4; step++) {
      const noteStart = t0 + step * beatSec;
      if (noteStart >= durationSec - 0.2) break;
      const noteFreq = chord[(step + (bar % 2)) % chord.length] * 2;
      const osc = offline.createOscillator();
      osc.type = "sine";
      osc.frequency.value = noteFreq;

      const noteGain = offline.createGain();
      noteGain.gain.setValueAtTime(0.0001, noteStart);
      noteGain.gain.linearRampToValueAtTime(0.11, noteStart + 0.02);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, Math.min(durationSec, noteStart + beatSec * 1.8));

      osc.connect(noteGain);
      noteGain.connect(lowpass);
      osc.start(noteStart);
      osc.stop(Math.min(durationSec, noteStart + beatSec * 1.9));
    }
  }

  const rendered = await offline.startRendering();
  return encodeWavFromAudioBuffer(rendered);
}

function buildHeaders(token?: string, includeJson = true): Record<string, string> {
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

export async function probeLocalDirect(
  kind: "ollama" | "openai_compatible" | "a1111" | "comfyui" | "video",
  rawBaseUrl: string,
  authToken?: string
): Promise<{ ok: boolean; models: string[]; message: string }> {
  const url = rawBaseUrl.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`無效的本地端服務位址：${rawBaseUrl || "(空白)"}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("僅支援 http:// 或 https:// 本地端位址");
  }

  const headers = buildHeaders(authToken, false);
  if (kind === "ollama") {
    const resp = await fetch(`${url}/api/tags`, { headers });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as { models?: Array<{ name?: string; model?: string }> };
    const models = (data.models ?? []).map((m) => m.name || m.model || "").filter(Boolean);
    return { ok: true, models, message: `瀏覽器已直連 Ollama，偵測到 ${models.length} 個模型` };
  }
  if (kind === "openai_compatible") {
    const endpoint = url.endsWith("/v1") ? `${url}/models` : `${url}/v1/models`;
    const resp = await fetch(endpoint, { headers });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as { data?: Array<{ id?: string }> };
    const models = (data.data ?? []).map((m) => m.id || "").filter(Boolean);
    return { ok: true, models, message: `瀏覽器已直連端點，偵測到 ${models.length} 個模型` };
  }
  if (kind === "a1111") {
    const resp = await fetch(`${url}/sdapi/v1/sd-models`, { headers });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as Array<{ title?: string; model_name?: string }>;
    const models = data.map((m) => m.title || m.model_name || "").filter(Boolean);
    return { ok: true, models, message: `瀏覽器已直連 A1111，偵測到 ${models.length} 個權重` };
  }
  if (kind === "video") {
    const resp = await fetch(url, { headers });
    if (resp.status === 401 || resp.status === 403) {
      throw new Error(`驗證失敗（HTTP ${resp.status}），請檢查 Bearer Token 是否正確`);
    }
    if (resp.status === 405) {
      return {
        ok: true,
        models: [],
        message: "瀏覽器已直連影片端點（伺服器回應 405，僅接受 POST 請求）",
      };
    }
    if (resp.status === 404) {
      const opt = await fetch(url, { method: "OPTIONS", headers }).catch(() => null);
      if (opt && (opt.ok || opt.status === 204)) {
        return {
          ok: true,
          models: [],
          message: "瀏覽器已直連影片端點（端點僅接受 POST / OPTIONS 請求）",
        };
      }
      throw new Error("HTTP 404（伺服器可連線，但找不到此端點路徑）");
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return { ok: true, models: [], message: `瀏覽器已直連本地影片端點（HTTP ${resp.status}）` };
  }
  const resp = await fetch(`${url}/object_info/CheckpointLoaderSimple`, { headers });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = (await resp.json()) as {
    CheckpointLoaderSimple?: { input?: { required?: { ckpt_name?: [string[]] } } };
  };
  const models = data.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? [];
  return { ok: true, models, message: `瀏覽器已直連 ComfyUI，偵測到 ${models.length} 個 Checkpoint` };
}

export async function generateLocalScriptDirect(
  params: {
    premise: string;
    genre: string;
    visualStyle: string;
    aspectRatio: AspectRatio;
    sceneCount: number;
    dialogueMode: "dialogue" | "narration";
  },
  local: LocalModelConfig
) {
  const baseUrl = local.llmBaseUrl.trim().replace(/\/+$/, "");
  const model = local.llmModel.trim() || "qwen2.5:14b";
  const systemPrompt = [
    "You are an acclaimed short-drama director and cinematographer.",
    "Output ONLY a valid JSON object with keys:",
    "title (Traditional Chinese), logline (Traditional Chinese), directorVision (Traditional Chinese), musicPrompt (English instrumental prompt),",
    "characters (array of { name, role, appearanceAnchor, voiceName, voiceStyle }),",
    `scenes (array of ${params.sceneCount} objects: sceneNumber, title, shotType, durationSec (5-8), motionEffect ('zoom'|'pan'|'pull'), visualPrompt, videoMotionPrompt, speaker, voiceName, voiceStyle, dialogueLine, sfxCue).`,
  ].join(" ");
  const userPrompt = `創作主題：${params.premise}\n題材：${params.genre}\n視覺風格：${params.visualStyle}\n比例：${params.aspectRatio}\n場數：${params.sceneCount}\n形式：${params.dialogueMode}`;

  let rawText = "";
  const llmHeaders = buildHeaders(local.llmAuthToken, true);
  if (local.llmProvider === "ollama") {
    const resp = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: llmHeaders,
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
    if (!resp.ok) throw new Error(`Ollama 錯誤 (${resp.status})`);
    const data = (await resp.json()) as { message?: { content?: string } };
    rawText = data.message?.content ?? "";
  } else {
    const endpoint = baseUrl.endsWith("/v1")
      ? `${baseUrl}/chat/completions`
      : `${baseUrl}/v1/chat/completions`;
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: llmHeaders,
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`本地 LLM 錯誤 (${resp.status})`);
    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    rawText = data.choices?.[0]?.message?.content ?? "";
  }

  return { production: extractJsonFromText(rawText) };
}

export async function generateLocalStoryboardDirect(
  params: { prompt: string; aspectRatio: AspectRatio },
  local: LocalModelConfig
): Promise<{ imageUrl: string; mimeType: string; model: string }> {
  const baseUrl = local.imageBaseUrl.trim().replace(/\/+$/, "");
  const width = params.aspectRatio === "9:16" ? 576 : 1024;
  const height = params.aspectRatio === "9:16" ? 1024 : 576;

  const imageHeaders = buildHeaders(local.imageAuthToken, true);

  if (local.imageProvider === "a1111") {
    const resp = await fetch(`${baseUrl}/sdapi/v1/txt2img`, {
      method: "POST",
      headers: imageHeaders,
      body: JSON.stringify({
        prompt: `${params.prompt}, cinematic film still, ultra detailed`,
        negative_prompt: "text, watermark, subtitle, blurry",
        width,
        height,
        steps: 24,
        ...(local.imageModel ? { override_settings: { sd_model_checkpoint: local.imageModel } } : {}),
      }),
    });
    if (!resp.ok) throw new Error(`Automatic1111 錯誤 (${resp.status})`);
    const data = (await resp.json()) as { images?: string[] };
    const b64 = data.images?.[0];
    if (!b64) throw new Error("未回傳圖片");
    return { imageUrl: `data:image/png;base64,${b64}`, mimeType: "image/png", model: local.imageModel || "a1111" };
  }

  if (local.imageProvider === "openai_compatible") {
    const endpoint = baseUrl.endsWith("/v1")
      ? `${baseUrl}/images/generations`
      : `${baseUrl}/v1/images/generations`;
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: imageHeaders,
      body: JSON.stringify({
        model: local.imageModel || "flux",
        prompt: params.prompt,
        size: `${width}x${height}`,
        response_format: "b64_json",
      }),
    });
    if (!resp.ok) throw new Error(`本地影像端點錯誤 (${resp.status})`);
    const data = (await resp.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const item = data.data?.[0];
    const imageUrl = item?.b64_json ? `data:image/png;base64,${item.b64_json}` : item?.url || "";
    if (!imageUrl) throw new Error("未回傳圖片");
    return { imageUrl, mimeType: "image/png", model: local.imageModel || "local-image" };
  }

  throw new Error("ComfyUI 流程需使用「後端伺服器代理」模式執行排程與取圖");
}

export async function generateLocalSpeechDirect(
  params: { text: string; voiceName: string },
  local: LocalModelConfig
): Promise<{ audioUrl: string; mimeType: string; voiceName: string }> {
  const baseUrl = local.ttsBaseUrl.trim().replace(/\/+$/, "");
  const endpoint = baseUrl.endsWith("/v1")
    ? `${baseUrl}/audio/speech`
    : baseUrl.endsWith("/audio/speech")
    ? baseUrl
    : `${baseUrl}/v1/audio/speech`;

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: buildHeaders(local.ttsAuthToken, true),
    body: JSON.stringify({
      model: local.ttsModel || "kokoro",
      input: params.text,
      voice: local.ttsVoice || params.voiceName || "zf_xiaoxiao",
      response_format: "wav",
    }),
  });
  if (!resp.ok) throw new Error(`本地語音服務錯誤 (${resp.status})`);
  const buf = new Uint8Array(await resp.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < buf.length; i += chunkSize) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunkSize));
  }
  const mimeType = resp.headers.get("content-type")?.split(";")[0] || "audio/wav";
  return {
    audioUrl: `data:${mimeType};base64,${btoa(binary)}`,
    mimeType,
    voiceName: local.ttsVoice || params.voiceName,
  };
}

export async function generateLocalVideoDirect(
  params: {
    prompt: string;
    imageDataUrl?: string;
    aspectRatio: AspectRatio;
    durationSec: number;
  },
  local: LocalModelConfig
): Promise<{ videoUrl: string; mimeType: string }> {
  const baseUrl = local.videoBaseUrl.trim().replace(/\/+$/, "");
  const resp = await fetch(baseUrl, {
    method: "POST",
    headers: buildHeaders(local.videoAuthToken, true),
    body: JSON.stringify(params),
  });
  if (!resp.ok) throw new Error(`本地影片服務錯誤 (${resp.status})`);
  const contentType = resp.headers.get("content-type") || "";
  if (contentType.includes("video/")) {
    const buf = new Uint8Array(await resp.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < buf.length; i += chunkSize) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunkSize));
    }
    return { videoUrl: `data:${contentType};base64,${btoa(binary)}`, mimeType: contentType };
  }
  const json = (await resp.json()) as { videoUrl?: string; data?: string; mimeType?: string };
  const videoUrl =
    json.videoUrl || (json.data ? `data:${json.mimeType || "video/mp4"};base64,${json.data}` : "");
  if (!videoUrl) throw new Error("本地影片端點未回傳 videoUrl 或 base64 影片資料");
  return { videoUrl, mimeType: json.mimeType || "video/mp4" };
}
