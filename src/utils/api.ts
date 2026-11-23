import type {
  AspectRatio,
  DramaProject,
  DramaScene,
  EnginePreferences,
  ProductionBrief,
  VoiceName,
} from "../types/director";
import {
  DEFAULT_ENGINE_PREFERENCES,
  generateLocalScriptDirect,
  generateLocalSpeechDirect,
  generateLocalStoryboardDirect,
  probeLocalDirect,
  synthesizeLocalCinemaScore,
} from "./localRuntime";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `請求失敗 (${res.status})`);
  }
  return data as T;
}

export interface GeneratedScriptResponse {
  production: {
    title: string;
    logline: string;
    directorVision: string;
    musicPrompt: string;
    characters: DramaProject["characters"];
    scenes: Array<
      Omit<DramaScene, "id" | "status" | "imageUrl" | "videoUrl" | "audioUrl">
    >;
  };
}

function normalizeProductionResponse(raw: Record<string, unknown>, brief: ProductionBrief): GeneratedScriptResponse {
  const rawChars = Array.isArray(raw.characters) ? raw.characters : [];
  const rawScenes = Array.isArray(raw.scenes) ? raw.scenes : [];

  const characters = rawChars.map((c: Record<string, unknown>, idx: number) => ({
    name: String(c.name || `角色 ${idx + 1}`),
    role: String(c.role || "主角"),
    appearanceAnchor: String(c.appearanceAnchor || "East Asian cinematic character"),
    voiceName: (["Puck", "Charon", "Kore", "Fenrir", "Zephyr"].includes(String(c.voiceName))
      ? String(c.voiceName)
      : idx % 2 === 0
      ? "Charon"
      : "Kore") as VoiceName,
    voiceStyle: String(c.voiceStyle || "Calm cinematic delivery"),
  }));

  const scenes = rawScenes.map((s: Record<string, unknown>, idx: number) => ({
    sceneNumber: Number(s.sceneNumber) || idx + 1,
    title: String(s.title || `第 ${idx + 1} 場`),
    shotType: String(s.shotType || "中景緩推 · 35mm"),
    durationSec: Math.min(10, Math.max(4, Number(s.durationSec) || 6)),
    motionEffect: (["zoom", "pan", "pull"].includes(String(s.motionEffect))
      ? String(s.motionEffect)
      : "zoom") as DramaScene["motionEffect"],
    visualPrompt: String(s.visualPrompt || brief.premise),
    videoMotionPrompt: String(s.videoMotionPrompt || s.visualPrompt || brief.premise),
    speaker: String(s.speaker || characters[0]?.name || "旁白"),
    voiceName: (["Puck", "Charon", "Kore", "Fenrir", "Zephyr"].includes(String(s.voiceName))
      ? String(s.voiceName)
      : characters[0]?.voiceName || "Charon") as VoiceName,
    voiceStyle: String(s.voiceStyle || "Calm cinematic delivery"),
    dialogueLine: String(s.dialogueLine || ""),
    sfxCue: String(s.sfxCue || "環境背景音"),
  }));

  return {
    production: {
      title: String(raw.title || "未命名 AI 短劇"),
      logline: String(raw.logline || brief.premise),
      directorVision: String(raw.directorVision || `${brief.visualStyle}，${brief.genre}`),
      musicPrompt: String(
        raw.musicPrompt || "Minimalist cinematic underscore, felt piano and warm strings, no vocals"
      ),
      characters,
      scenes,
    },
  };
}

export async function probeLocalEndpoint(
  kind: "ollama" | "openai_compatible" | "a1111" | "comfyui",
  baseUrl: string,
  transportMode: "server" | "browser",
  authToken?: string
): Promise<{ ok: boolean; models: string[]; message: string }> {
  if (transportMode === "browser") {
    return probeLocalDirect(kind, baseUrl, authToken);
  }
  return postJson("/api/local/probe", { kind, baseUrl, authToken });
}

export async function generateScriptApi(
  brief: ProductionBrief,
  prefs: EnginePreferences = DEFAULT_ENGINE_PREFERENCES
): Promise<GeneratedScriptResponse> {
  if (prefs.scriptProvider === "local") {
    if (prefs.local.transportMode === "browser") {
      const res = await generateLocalScriptDirect(brief, prefs.local);
      return normalizeProductionResponse(res.production, brief);
    }
    const res = await postJson<{ production: Record<string, unknown> }>("/api/local/script", {
      ...brief,
      localConfig: prefs.local,
    });
    return normalizeProductionResponse(res.production, brief);
  }
  return postJson<GeneratedScriptResponse>("/api/director/script", brief);
}

export async function generateStoryboardApi(
  params: {
    prompt: string;
    aspectRatio: AspectRatio;
    highQuality?: boolean;
    referenceImageDataUrl?: string;
  },
  prefs: EnginePreferences = DEFAULT_ENGINE_PREFERENCES
): Promise<{ imageUrl: string; mimeType: string; model: string }> {
  if (prefs.imageProvider === "local") {
    if (prefs.local.transportMode === "browser") {
      return generateLocalStoryboardDirect(params, prefs.local);
    }
    return postJson("/api/local/storyboard", {
      ...params,
      localConfig: prefs.local,
    });
  }
  return postJson("/api/director/storyboard", params);
}

export async function generateVideoApi(
  params: {
    prompt: string;
    imageDataUrl?: string;
    aspectRatio: AspectRatio;
    durationSec: number;
  },
  prefs: EnginePreferences = DEFAULT_ENGINE_PREFERENCES
): Promise<{ videoUrl: string; mimeType: string }> {
  if (prefs.videoProvider === "local") {
    return postJson("/api/local/video", {
      ...params,
      localConfig: prefs.local,
    });
  }
  return postJson("/api/director/video", params);
}

export async function generateSpeechApi(
  params: {
    text: string;
    voiceName: VoiceName;
    voiceStyle: string;
    expressive?: boolean;
  },
  prefs: EnginePreferences = DEFAULT_ENGINE_PREFERENCES
): Promise<{ audioUrl: string; mimeType: string; voiceName: string }> {
  if (prefs.speechProvider === "local") {
    if (prefs.local.ttsProvider === "browser_speech") {
      throw new Error(
        "目前本地語音設為「瀏覽器即時朗讀（Web Speech）」，於放映廳播放時會自動朗讀字幕；若需產生可下載的 WAV 音軌，請切換至本地 TTS 伺服器（如 Kokoro）或 Gemini TTS。"
      );
    }
    if (prefs.local.transportMode === "browser") {
      return generateLocalSpeechDirect(params, prefs.local);
    }
    return postJson("/api/local/speech", {
      ...params,
      localConfig: prefs.local,
    });
  }
  return postJson("/api/director/speech", params);
}

export async function generateMusicApi(
  params: {
    prompt: string;
    referenceImageDataUrl?: string;
    proMode?: boolean;
  },
  prefs: EnginePreferences = DEFAULT_ENGINE_PREFERENCES
): Promise<{ audioUrl: string; lyrics: string; mimeType: string }> {
  if (prefs.musicProvider === "local") {
    if (prefs.local.musicProvider === "local_synth") {
      const audioUrl = await synthesizeLocalCinemaScore(params.prompt);
      return { audioUrl, lyrics: "", mimeType: "audio/wav" };
    }
    return postJson("/api/local/music", {
      ...params,
      localConfig: prefs.local,
    });
  }
  return postJson("/api/director/music", params);
}
