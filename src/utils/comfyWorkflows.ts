export const DEFAULT_COMFYUI_IMAGE_WORKFLOW = {
  "3": {
    class_type: "KSampler",
    inputs: {
      seed: "{{seed}}",
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
  "4": {
    class_type: "CheckpointLoaderSimple",
    inputs: {
      ckpt_name: "{{checkpoint}}",
    },
  },
  "5": {
    class_type: "EmptyLatentImage",
    inputs: {
      width: "{{width}}",
      height: "{{height}}",
      batch_size: 1,
    },
  },
  "6": {
    class_type: "CLIPTextEncode",
    inputs: {
      text: "{{prompt}}, cinematic film still",
      clip: ["4", 1],
    },
  },
  "7": {
    class_type: "CLIPTextEncode",
    inputs: {
      text: "{{negative_prompt}}",
      clip: ["4", 1],
    },
  },
  "8": {
    class_type: "VAEDecode",
    inputs: {
      samples: ["3", 0],
      vae: ["4", 2],
    },
  },
  "9": {
    class_type: "SaveImage",
    inputs: {
      filename_prefix: "cineforge",
      images: ["8", 0],
    },
  },
} as const;

export const DEFAULT_COMFYUI_VIDEO_WORKFLOW = {
  "1": {
    class_type: "ImageOnlyCheckpointLoader",
    inputs: {
      ckpt_name: "{{checkpoint}}",
    },
  },
  "2": {
    class_type: "LoadImage",
    inputs: {
      image: "{{image_filename}}",
      upload: "image",
    },
  },
  "3": {
    class_type: "SVD_img2vid_Conditioning",
    inputs: {
      clip_vision: ["1", 1],
      init_image: ["2", 0],
      vae: ["1", 2],
      width: "{{width}}",
      height: "{{height}}",
      video_frames: "{{frames}}",
      motion_bucket_id: 127,
      fps: 8,
      augmentation_level: 0.0,
    },
  },
  "4": {
    class_type: "VideoLinearCFGGuidance",
    inputs: {
      model: ["1", 0],
      min_cfg: 1.0,
    },
  },
  "5": {
    class_type: "KSampler",
    inputs: {
      seed: "{{seed}}",
      steps: 20,
      cfg: 2.5,
      sampler_name: "euler",
      scheduler: "karras",
      denoise: 1.0,
      model: ["4", 0],
      positive: ["3", 0],
      negative: ["3", 1],
      latent_image: ["3", 2],
    },
  },
  "6": {
    class_type: "VAEDecode",
    inputs: {
      samples: ["5", 0],
      vae: ["1", 2],
    },
  },
  "7": {
    class_type: "CreateVideo",
    inputs: {
      images: ["6", 0],
      fps: 8,
    },
  },
  "8": {
    class_type: "SaveVideo",
    inputs: {
      video: ["7", 0],
      filename_prefix: "cineforge_video",
      format: "mp4",
      codec: "h264",
    },
  },
} as const;

export const DEFAULT_COMFYUI_IMAGE_WORKFLOW_JSON = JSON.stringify(
  DEFAULT_COMFYUI_IMAGE_WORKFLOW,
  null,
  2
);

export const DEFAULT_COMFYUI_VIDEO_WORKFLOW_JSON = JSON.stringify(
  DEFAULT_COMFYUI_VIDEO_WORKFLOW,
  null,
  2
);

export interface ComfyWorkflowVariables {
  prompt: string;
  negative_prompt: string;
  width: number;
  height: number;
  seed: number;
  checkpoint: string;
  reference_image?: string;
  image_filename?: string;
  frames?: number;
  duration_sec?: number;
}

export function parseComfyApiWorkflow(rawJson: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "語法錯誤";
    throw new Error(`ComfyUI Workflow JSON 格式無效：${detail}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("ComfyUI Workflow 必須為 JSON 物件（Key 為節點編號）。");
  }
  const obj = parsed as Record<string, unknown>;
  if (Array.isArray(obj.nodes) && Array.isArray(obj.links)) {
    throw new Error(
      "偵測到 ComfyUI 一般編輯器存檔格式（含 nodes/links 陣列），請在 ComfyUI 開啟 Dev Mode 後改用「Save (API Format)」匯出。"
    );
  }
  return obj;
}

export function inspectComfyWorkflow(rawJson: string): {
  valid: boolean;
  error?: string;
  nodeCount: number;
  placeholders: string[];
} {
  try {
    const obj = parseComfyApiWorkflow(rawJson);
    const nodeCount = Object.keys(obj).length;
    const matches = rawJson.match(/\{\{[a-zA-Z0-9_]+\}\}/g) ?? [];
    const placeholders = Array.from(new Set(matches));
    return { valid: true, nodeCount, placeholders };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "JSON 解析錯誤",
      nodeCount: 0,
      placeholders: [],
    };
  }
}

export function compileComfyWorkflow(
  customJson: string | undefined,
  fallbackWorkflow: Record<string, unknown>,
  vars: ComfyWorkflowVariables
): Record<string, unknown> {
  const baseObj =
    typeof customJson === "string" && customJson.trim()
      ? parseComfyApiWorkflow(customJson)
      : fallbackWorkflow;

  const numericMap: Record<string, number | undefined> = {
    width: vars.width,
    height: vars.height,
    seed: vars.seed,
    frames: vars.frames,
    duration_sec: vars.duration_sec,
  };

  const stringMap: Record<string, string> = {
    prompt: vars.prompt,
    negative_prompt: vars.negative_prompt,
    width: String(vars.width),
    height: String(vars.height),
    seed: String(vars.seed),
    checkpoint: vars.checkpoint,
    reference_image: vars.reference_image ?? "",
    image_filename: vars.image_filename ?? vars.reference_image ?? "",
    frames: String(vars.frames ?? 25),
    duration_sec: String(vars.duration_sec ?? 6),
  };

  const walk = (val: unknown): unknown => {
    if (typeof val === "string") {
      const exactMatch = val.match(/^\{\{([a-zA-Z0-9_]+)\}\}$/);
      if (exactMatch) {
        const key = exactMatch[1];
        if (key in numericMap && numericMap[key] !== undefined) {
          return numericMap[key];
        }
        if (key in stringMap) {
          return stringMap[key];
        }
      }
      return val.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (full, key: string) =>
        key in stringMap ? stringMap[key] : full
      );
    }
    if (Array.isArray(val)) {
      return val.map(walk);
    }
    if (val && typeof val === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        out[k] = walk(v);
      }
      return out;
    }
    return val;
  };

  return walk(baseObj) as Record<string, unknown>;
}
