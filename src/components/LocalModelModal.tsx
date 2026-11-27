import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  FileCode2,
  KeyRound,
  Loader2,
  RefreshCw,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import type { EnginePreferences, EngineProvider, LocalModelConfig } from "../types/director";
import { probeLocalEndpoint } from "../utils/api";
import {
  DEFAULT_COMFYUI_IMAGE_WORKFLOW_JSON,
  DEFAULT_COMFYUI_VIDEO_WORKFLOW_JSON,
  inspectComfyWorkflow,
} from "../utils/comfyWorkflows";

interface LocalModelModalProps {
  open: boolean;
  preferences: EnginePreferences;
  onSave: (prefs: EnginePreferences) => void;
  onClose: () => void;
}

function TokenField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-1">
      <label className="text-zinc-400 flex items-center gap-1.5">
        <KeyRound className="w-3 h-3 text-zinc-500" />
        <span>{label}</span>
      </label>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "選填（將以 Authorization: Bearer <token> 傳送）"}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-lg bg-zinc-950 border border-zinc-800 pl-3 pr-9 py-2 font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/70"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "隱藏權杖" : "顯示權杖"}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-200 cursor-pointer"
        >
          {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

function ComfyWorkflowEditor({
  title,
  placeholderHint,
  value,
  defaultJson,
  onChange,
}: {
  title: string;
  placeholderHint: string;
  value: string;
  defaultJson: string;
  onChange: (next: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inspection = inspectComfyWorkflow(value);

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    onChange(text);
  };

  return (
    <div className="rounded-lg bg-zinc-950/90 border border-zinc-800 p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileCode2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-zinc-200 font-medium">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              void handleImportFile(file);
              e.target.value = "";
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
          >
            <Upload className="w-3 h-3" />
            <span>匯入 API JSON</span>
          </button>
          <button
            type="button"
            onClick={() => onChange(defaultJson)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>還原系統預設</span>
          </button>
        </div>
      </div>

      <p className="text-[11px] text-zinc-400 leading-relaxed">
        預設顯示系統目前使用的 ComfyUI API Workflow，您可直接編輯或從 ComfyUI（Dev Mode → Save API Format）匯入自訂流程。支援變數：
        <code className="font-mono text-amber-300/90 ml-1">{placeholderHint}</code>
      </p>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={10}
        spellCheck={false}
        className="w-full rounded-lg bg-[#09090B] border border-zinc-800 p-2.5 font-mono text-[11px] leading-relaxed text-zinc-200 focus:outline-none focus:border-amber-500/70 resize-y"
      />

      {inspection.valid ? (
        <p className="text-[11px] text-emerald-400">
          API Workflow 格式有效（共 {inspection.nodeCount} 個節點
          {inspection.placeholders.length > 0
            ? `，偵測到佔位符：${inspection.placeholders.join("、")}`
            : "，未偵測到動態佔位符"}
          ）
        </p>
      ) : (
        <p className="text-[11px] text-rose-400">{inspection.error}</p>
      )}
    </div>
  );
}

export function LocalModelModal({
  open,
  preferences,
  onSave,
  onClose,
}: LocalModelModalProps) {
  const [draft, setDraft] = useState<EnginePreferences>(preferences);
  const [llmModels, setLlmModels] = useState<string[]>([]);
  const [imageModels, setImageModels] = useState<string[]>([]);
  const [videoModels, setVideoModels] = useState<string[]>([]);
  const [workflowSaveError, setWorkflowSaveError] = useState<string | null>(null);
  const [probeState, setProbeState] = useState<{
    target: "llm" | "image" | "video" | null;
    loading: boolean;
    message?: string;
    error?: string;
  }>({ target: null, loading: false });

  useEffect(() => {
    if (open) {
      setDraft(preferences);
      setWorkflowSaveError(null);
      setProbeState({ target: null, loading: false });
    }
  }, [open, preferences]);

  if (!open) return null;

  const updateLocal = (patch: Partial<LocalModelConfig>) => {
    setWorkflowSaveError(null);
    setDraft((prev) => ({
      ...prev,
      local: { ...prev.local, ...patch },
    }));
  };

  const setAllProviders = (provider: EngineProvider) => {
    setDraft((prev) => ({
      ...prev,
      scriptProvider: provider,
      imageProvider: provider,
      videoProvider: provider,
      speechProvider: provider,
      musicProvider: provider,
    }));
  };

  const handleProbe = async (target: "llm" | "image" | "video") => {
    setProbeState({ target, loading: true });
    try {
      if (target === "llm") {
        const res = await probeLocalEndpoint(
          draft.local.llmProvider,
          draft.local.llmBaseUrl,
          draft.local.transportMode,
          draft.local.llmAuthToken
        );
        setLlmModels(res.models);
        if (res.models.length > 0 && !res.models.includes(draft.local.llmModel)) {
          updateLocal({ llmModel: res.models[0] });
        }
        setProbeState({ target, loading: false, message: res.message });
      } else if (target === "image") {
        const res = await probeLocalEndpoint(
          draft.local.imageProvider,
          draft.local.imageBaseUrl,
          draft.local.transportMode,
          draft.local.imageAuthToken
        );
        setImageModels(res.models);
        if (res.models.length > 0 && !draft.local.imageModel) {
          updateLocal({ imageModel: res.models[0] });
        }
        setProbeState({ target, loading: false, message: res.message });
      } else {
        const probeKind = draft.local.videoProvider === "comfyui_animate" ? "comfyui" : "video";
        const res = await probeLocalEndpoint(
          probeKind,
          draft.local.videoBaseUrl,
          draft.local.transportMode,
          draft.local.videoAuthToken
        );
        setVideoModels(res.models);
        if (res.models.length > 0 && !draft.local.videoModel) {
          updateLocal({ videoModel: res.models[0] });
        }
        setProbeState({ target, loading: false, message: res.message });
      }
    } catch (err) {
      setProbeState({
        target,
        loading: false,
        error: err instanceof Error ? err.message : "連線檢測失敗",
      });
    }
  };

  const handleApply = () => {
    const imgWorkflow = draft.local.imageWorkflowJson ?? DEFAULT_COMFYUI_IMAGE_WORKFLOW_JSON;
    const vidWorkflow = draft.local.videoWorkflowJson ?? DEFAULT_COMFYUI_VIDEO_WORKFLOW_JSON;

    if (draft.local.imageProvider === "comfyui") {
      const imgInspect = inspectComfyWorkflow(imgWorkflow);
      if (!imgInspect.valid) {
        setWorkflowSaveError(`生圖 ComfyUI Workflow 錯誤：${imgInspect.error}`);
        return;
      }
    }
    if (draft.local.videoProvider === "comfyui_animate") {
      const vidInspect = inspectComfyWorkflow(vidWorkflow);
      if (!vidInspect.valid) {
        setWorkflowSaveError(`影片 ComfyUI Workflow 錯誤：${vidInspect.error}`);
        return;
      }
    }
    onSave({
      ...draft,
      local: {
        ...draft.local,
        imageWorkflowJson: imgWorkflow.trim() ? imgWorkflow : DEFAULT_COMFYUI_IMAGE_WORKFLOW_JSON,
        videoWorkflowJson: vidWorkflow.trim() ? vidWorkflow : DEFAULT_COMFYUI_VIDEO_WORKFLOW_JSON,
      },
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="local-model-title"
    >
      <div className="w-full max-w-3xl bg-[#111114] border border-zinc-800 rounded-xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-5 h-5 text-amber-400" />
            <h2 id="local-model-title" className="text-base font-semibold text-zinc-100">
              模型引擎與本地端模型設定
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉設定"
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto text-xs">
          {/* Quick Mode Switch + Transport Mode */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-zinc-800">
            <div className="space-y-1">
              <span className="text-zinc-300 font-medium block">一鍵切換製片引擎</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAllProviders("gemini")}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 hover:border-zinc-700 cursor-pointer"
                >
                  全部使用 Gemini 雲端
                </button>
                <button
                  type="button"
                  onClick={() => setAllProviders("local")}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-amber-400 hover:border-amber-500/60 cursor-pointer"
                >
                  全部切換至本地模型
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-zinc-300 font-medium block">本地端連線路由</span>
              <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => updateLocal({ transportMode: "server" })}
                  className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                    draft.local.transportMode === "server"
                      ? "bg-zinc-800 text-amber-400 font-medium"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  後端伺服器代理
                </button>
                <button
                  type="button"
                  onClick={() => updateLocal({ transportMode: "browser" })}
                  className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                    draft.local.transportMode === "browser"
                      ? "bg-zinc-800 text-amber-400 font-medium"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  瀏覽器直連本機
                </button>
              </div>
            </div>
          </div>

          {/* Per-Modality Routing Grid */}
          <div className="space-y-2.5">
            <span className="text-zinc-300 font-medium block">各製片環節引擎指派（支援雲端與本地混合編排）</span>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {(
                [
                  { key: "scriptProvider", label: "劇本編導" },
                  { key: "imageProvider", label: "分鏡繪製" },
                  { key: "videoProvider", label: "動態影片" },
                  { key: "speechProvider", label: "角色配音" },
                  { key: "musicProvider", label: "電影配樂" },
                ] as const
              ).map((item) => (
                <div
                  key={item.key}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 space-y-2"
                >
                  <span className="text-zinc-300 font-medium block">{item.label}</span>
                  <div className="grid grid-cols-2 gap-1 p-0.5 bg-zinc-900 rounded">
                    <button
                      type="button"
                      onClick={() => setDraft((p) => ({ ...p, [item.key]: "gemini" }))}
                      className={`py-1 rounded text-[11px] cursor-pointer ${
                        draft[item.key] === "gemini"
                          ? "bg-zinc-800 text-zinc-100 font-medium"
                          : "text-zinc-500"
                      }`}
                    >
                      Gemini
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraft((p) => ({ ...p, [item.key]: "local" }))}
                      className={`py-1 rounded text-[11px] cursor-pointer ${
                        draft[item.key] === "local"
                          ? "bg-amber-500 text-zinc-950 font-semibold"
                          : "text-zinc-500"
                      }`}
                    >
                      本地
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 1. Local Script LLM */}
          <div className="pt-4 border-t border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">
                1. 本地語言模型（Ollama / LM Studio / vLLM）
              </h3>
              <button
                type="button"
                onClick={() => handleProbe("llm")}
                disabled={probeState.loading && probeState.target === "llm"}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 hover:bg-zinc-800 cursor-pointer"
              >
                {probeState.loading && probeState.target === "llm" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>偵測本地模型</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-zinc-400 block">協定類型</label>
                <select
                  value={draft.local.llmProvider}
                  onChange={(e) =>
                    updateLocal({
                      llmProvider: e.target.value as LocalModelConfig["llmProvider"],
                      llmBaseUrl:
                        e.target.value === "ollama"
                          ? "http://127.0.0.1:11434"
                          : "http://127.0.0.1:1234/v1",
                    })
                  }
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-100"
                >
                  <option value="ollama">Ollama (/api/chat)</option>
                  <option value="openai_compatible">OpenAI 相容 (LM Studio / vLLM)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-zinc-400 block">服務位址</label>
                <input
                  type="text"
                  value={draft.local.llmBaseUrl}
                  onChange={(e) => updateLocal({ llmBaseUrl: e.target.value })}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 font-mono text-zinc-100"
                />
              </div>
              <div className="space-y-1">
                <label className="text-zinc-400 block">模型名稱</label>
                {llmModels.length > 0 ? (
                  <select
                    value={draft.local.llmModel}
                    onChange={(e) => updateLocal({ llmModel: e.target.value })}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 font-mono text-zinc-100"
                  >
                    {llmModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={draft.local.llmModel}
                    onChange={(e) => updateLocal({ llmModel: e.target.value })}
                    placeholder="例如 qwen2.5:14b"
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 font-mono text-zinc-100"
                  />
                )}
              </div>
            </div>

            <TokenField
              label="語言模型端點 Access Token / Bearer Token（選填，用於 vLLM / LM Studio / RunPod / 反向代理）"
              value={draft.local.llmAuthToken ?? ""}
              onChange={(val) => updateLocal({ llmAuthToken: val })}
            />

            {probeState.target === "llm" && (probeState.message || probeState.error) && (
              <p className={probeState.error ? "text-rose-400" : "text-emerald-400"}>
                {probeState.error || probeState.message}
              </p>
            )}
          </div>

          {/* 2. Local Image & Video */}
          <div className="pt-4 border-t border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">
                2. 本地影像與動態影片模型（Automatic1111 / ComfyUI）
              </h3>
              <button
                type="button"
                onClick={() => handleProbe("image")}
                disabled={probeState.loading && probeState.target === "image"}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 hover:bg-zinc-800 cursor-pointer"
              >
                {probeState.loading && probeState.target === "image" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>偵測生圖權重</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-zinc-400 block">生圖引擎</label>
                <select
                  value={draft.local.imageProvider}
                  onChange={(e) =>
                    updateLocal({
                      imageProvider: e.target.value as LocalModelConfig["imageProvider"],
                      imageBaseUrl:
                        e.target.value === "comfyui"
                          ? "http://127.0.0.1:8188"
                          : e.target.value === "a1111"
                          ? "http://127.0.0.1:7860"
                          : "http://127.0.0.1:8000/v1",
                    })
                  }
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-100"
                >
                  <option value="a1111">Automatic1111 / Forge</option>
                  <option value="comfyui">ComfyUI (/prompt)</option>
                  <option value="openai_compatible">OpenAI 相容生圖端點</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-zinc-400 block">生圖服務位址</label>
                <input
                  type="text"
                  value={draft.local.imageBaseUrl}
                  onChange={(e) => updateLocal({ imageBaseUrl: e.target.value })}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 font-mono text-zinc-100"
                />
              </div>
              <div className="space-y-1">
                <label className="text-zinc-400 block">Checkpoint 模型（選填）</label>
                {imageModels.length > 0 ? (
                  <select
                    value={draft.local.imageModel}
                    onChange={(e) => updateLocal({ imageModel: e.target.value })}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 font-mono text-zinc-100"
                  >
                    {imageModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={draft.local.imageModel}
                    onChange={(e) => updateLocal({ imageModel: e.target.value })}
                    placeholder="自動使用預設權重"
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 font-mono text-zinc-100"
                  />
                )}
              </div>
            </div>

            <TokenField
              label="生圖端點 Access Token / Bearer Token（選填）"
              value={draft.local.imageAuthToken ?? ""}
              onChange={(val) => updateLocal({ imageAuthToken: val })}
            />

            {probeState.target === "image" && (probeState.message || probeState.error) && (
              <p className={probeState.error ? "text-rose-400" : "text-emerald-400"}>
                {probeState.error || probeState.message}
              </p>
            )}

            {draft.local.imageProvider === "comfyui" && (
              <ComfyWorkflowEditor
                title="生圖 ComfyUI Workflow（API Format）"
                placeholderHint="{{prompt}} {{negative_prompt}} {{width}} {{height}} {{seed}} {{checkpoint}} {{reference_image}}"
                value={draft.local.imageWorkflowJson ?? DEFAULT_COMFYUI_IMAGE_WORKFLOW_JSON}
                defaultJson={DEFAULT_COMFYUI_IMAGE_WORKFLOW_JSON}
                onChange={(next) => updateLocal({ imageWorkflowJson: next })}
              />
            )}

            <div className="pt-2 border-t border-zinc-800/70 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-300 font-medium">
                  本地動態影片生成（支援 ComfyUI 影片 Workflow 或自訂 HTTP 端點）
                </span>
                <button
                  type="button"
                  onClick={() => handleProbe("video")}
                  disabled={probeState.loading && probeState.target === "video"}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 hover:bg-zinc-800 cursor-pointer shrink-0"
                >
                  {probeState.loading && probeState.target === "video" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {draft.local.videoProvider === "comfyui_animate"
                      ? "檢測 ComfyUI 影片連線"
                      : "檢測影片連線"}
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-zinc-400 block">影片引擎協定</label>
                  <select
                    value={draft.local.videoProvider}
                    onChange={(e) =>
                      updateLocal({
                        videoProvider: e.target.value as LocalModelConfig["videoProvider"],
                      })
                    }
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-100"
                  >
                    <option value="custom_http">自訂 HTTP 影片端點</option>
                    <option value="comfyui_animate">ComfyUI 影片 Workflow (/prompt)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-zinc-400 block">影片端點位址</label>
                  <input
                    type="text"
                    value={draft.local.videoBaseUrl}
                    onChange={(e) => updateLocal({ videoBaseUrl: e.target.value })}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 font-mono text-zinc-100"
                  />
                </div>

                {draft.local.videoProvider === "comfyui_animate" ? (
                  <div className="space-y-1">
                    <label className="text-zinc-400 block">影片 Checkpoint（選填）</label>
                    {videoModels.length > 0 ? (
                      <select
                        value={draft.local.videoModel ?? ""}
                        onChange={(e) => updateLocal({ videoModel: e.target.value })}
                        className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 font-mono text-zinc-100"
                      >
                        <option value="">自動偵測</option>
                        {videoModels.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={draft.local.videoModel ?? ""}
                        onChange={(e) => updateLocal({ videoModel: e.target.value })}
                        placeholder="例如 svd_xt.safetensors"
                        className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 font-mono text-zinc-100"
                      />
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-zinc-400 block">HTTP 介面規格</label>
                    <div className="rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-500">
                      POST JSON (prompt / imageDataUrl)
                    </div>
                  </div>
                )}
              </div>

              <TokenField
                label="影片端點 Access Token / Bearer Token（選填）"
                value={draft.local.videoAuthToken ?? ""}
                onChange={(val) => updateLocal({ videoAuthToken: val })}
              />

              {probeState.target === "video" && (probeState.message || probeState.error) && (
                <p className={probeState.error ? "text-rose-400" : "text-emerald-400"}>
                  {probeState.error || probeState.message}
                </p>
              )}

              {draft.local.videoProvider === "comfyui_animate" && (
                <ComfyWorkflowEditor
                  title="動態影片 ComfyUI Workflow（API Format）"
                  placeholderHint="{{image_filename}} {{prompt}} {{negative_prompt}} {{width}} {{height}} {{frames}} {{duration_sec}} {{seed}} {{checkpoint}}"
                  value={draft.local.videoWorkflowJson ?? DEFAULT_COMFYUI_VIDEO_WORKFLOW_JSON}
                  defaultJson={DEFAULT_COMFYUI_VIDEO_WORKFLOW_JSON}
                  onChange={(next) => updateLocal({ videoWorkflowJson: next })}
                />
              )}
            </div>
          </div>

          {/* 3. Local Audio (TTS & Music) */}
          <div className="pt-4 border-t border-zinc-800 space-y-3">
            <h3 className="text-sm font-semibold text-zinc-100">
              3. 本地語音合成與離線配樂
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-zinc-400 block">本地 TTS 引擎</label>
                <select
                  value={draft.local.ttsProvider}
                  onChange={(e) =>
                    updateLocal({ ttsProvider: e.target.value as LocalModelConfig["ttsProvider"] })
                  }
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-100"
                >
                  <option value="browser_speech">瀏覽器本機離線朗讀（零伺服器）</option>
                  <option value="openai_compatible">本地 TTS 伺服器（Kokoro / Coqui / Speaches）</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-zinc-400 block">本地電影配樂引擎</label>
                <select
                  value={draft.local.musicProvider}
                  onChange={(e) =>
                    updateLocal({
                      musicProvider: e.target.value as LocalModelConfig["musicProvider"],
                    })
                  }
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-100"
                >
                  <option value="local_synth">內建離線電影配樂合成器（30s WAV，可匯出成片）</option>
                  <option value="local_http">本地配樂 HTTP 伺服器（MusicGen / ACE-Step）</option>
                </select>
              </div>
            </div>

            {draft.local.ttsProvider === "openai_compatible" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-zinc-400 block">TTS 服務位址</label>
                    <input
                      type="text"
                      value={draft.local.ttsBaseUrl}
                      onChange={(e) => updateLocal({ ttsBaseUrl: e.target.value })}
                      className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 font-mono text-zinc-100"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-zinc-400 block">模型 ID</label>
                    <input
                      type="text"
                      value={draft.local.ttsModel}
                      onChange={(e) => updateLocal({ ttsModel: e.target.value })}
                      className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 font-mono text-zinc-100"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-zinc-400 block">預設聲線名稱</label>
                    <input
                      type="text"
                      value={draft.local.ttsVoice}
                      onChange={(e) => updateLocal({ ttsVoice: e.target.value })}
                      className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 font-mono text-zinc-100"
                    />
                  </div>
                </div>
                <TokenField
                  label="TTS 端點 Bearer Token（選填）"
                  value={draft.local.ttsAuthToken ?? ""}
                  onChange={(val) => updateLocal({ ttsAuthToken: val })}
                />
              </div>
            )}

            {draft.local.musicProvider === "local_http" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-zinc-400 block">本地配樂 HTTP 端點</label>
                  <input
                    type="text"
                    value={draft.local.musicBaseUrl}
                    onChange={(e) => updateLocal({ musicBaseUrl: e.target.value })}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 font-mono text-zinc-100"
                  />
                </div>
                <TokenField
                  label="配樂端點 Bearer Token（選填）"
                  value={draft.local.musicAuthToken ?? ""}
                  onChange={(val) => updateLocal({ musicAuthToken: val })}
                />
              </div>
            )}

            <p className="text-[11px] text-zinc-500 leading-relaxed">
              提示：若於雲端預覽網址使用「瀏覽器直連本機」連線電腦上的 Ollama，啟動時請加上{" "}
              <code className="font-mono text-zinc-300">OLLAMA_ORIGINS=&quot;*&quot; ollama serve</code>{" "}
              以允許跨來源存取；若在 Docker 或本機執行則可使用「後端伺服器代理」。Gemini 雲端模式金鑰{" "}
              <code className="font-mono text-zinc-300">GEMINI_API_KEY</code> 請透過執行環境（<code className="font-mono text-zinc-300">.env</code>、Docker{" "}
              <code className="font-mono text-zinc-300">-e</code> 或 AI Studio Secrets）注入。
            </p>
          </div>
        </div>

        {workflowSaveError && (
          <div className="px-6 py-2 bg-rose-950/60 border-t border-rose-800/60 text-xs text-rose-300">
            {workflowSaveError}
          </div>
        )}

        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg text-zinc-300 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-zinc-950 hover:bg-amber-400 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>套用引擎設定</span>
          </button>
        </div>
      </div>
    </div>
  );
}
