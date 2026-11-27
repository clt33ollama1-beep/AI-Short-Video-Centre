export type VoiceName = "Puck" | "Charon" | "Kore" | "Fenrir" | "Zephyr";

export type AspectRatio = "16:9" | "9:16";

export type MotionEffect = "zoom" | "pan" | "pull";

export type WorkspaceTab = "screening" | "storyboard" | "timeline";

export interface CharacterProfile {
  name: string;
  role: string;
  appearanceAnchor: string;
  voiceName: VoiceName;
  voiceStyle: string;
}

export interface DramaScene {
  id: string;
  sceneNumber: number;
  title: string;
  shotType: string;
  durationSec: number;
  motionEffect: MotionEffect;
  visualPrompt: string;
  videoMotionPrompt: string;
  speaker: string;
  voiceName: VoiceName;
  voiceStyle: string;
  dialogueLine: string;
  sfxCue: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  status: {
    image: "idle" | "generating" | "ready" | "error";
    video: "idle" | "generating" | "ready" | "error";
    audio: "idle" | "generating" | "ready" | "error";
    errorMessage?: string;
  };
}

export interface DramaProject {
  id: string;
  title: string;
  premise: string;
  genre: string;
  visualStyle: string;
  aspectRatio: AspectRatio;
  logline: string;
  directorVision: string;
  musicPrompt: string;
  musicUrl?: string;
  musicStatus: "idle" | "generating" | "ready" | "error";
  musicError?: string;
  characters: CharacterProfile[];
  scenes: DramaScene[];
  createdAt: string;
}

export interface ProductionBrief {
  premise: string;
  genre: string;
  visualStyle: string;
  aspectRatio: AspectRatio;
  sceneCount: number;
  dialogueMode: "dialogue" | "narration";
  highQualityImages: boolean;
  autoGenerateVideo: boolean;
}

export interface PipelineProgress {
  active: boolean;
  currentStep: string;
  completedCount: number;
  totalCount: number;
  error?: string;
}

export type EngineProvider = "gemini" | "local";

export interface LocalModelConfig {
  transportMode: "server" | "browser";
  llmProvider: "ollama" | "openai_compatible";
  llmBaseUrl: string;
  llmModel: string;
  llmAuthToken?: string;
  imageProvider: "a1111" | "comfyui" | "openai_compatible";
  imageBaseUrl: string;
  imageModel: string;
  imageAuthToken?: string;
  imageWorkflowJson?: string;
  videoProvider: "custom_http" | "comfyui_animate";
  videoBaseUrl: string;
  videoModel?: string;
  videoAuthToken?: string;
  videoWorkflowJson?: string;
  ttsProvider: "openai_compatible" | "browser_speech";
  ttsBaseUrl: string;
  ttsModel: string;
  ttsVoice: string;
  ttsAuthToken?: string;
  musicProvider: "local_synth" | "local_http";
  musicBaseUrl: string;
  musicAuthToken?: string;
}

export interface EnginePreferences {
  scriptProvider: EngineProvider;
  imageProvider: EngineProvider;
  videoProvider: EngineProvider;
  speechProvider: EngineProvider;
  musicProvider: EngineProvider;
  local: LocalModelConfig;
}

