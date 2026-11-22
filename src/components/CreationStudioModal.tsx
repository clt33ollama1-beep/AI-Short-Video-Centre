import { useState } from "react";
import { Clapperboard, Sparkles, X } from "lucide-react";
import { GENRE_OPTIONS, STORY_PRESETS, VISUAL_STYLE_OPTIONS } from "../data/showcaseProject";
import type { AspectRatio, ProductionBrief } from "../types/director";

interface CreationStudioModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (brief: ProductionBrief) => void;
  isSubmitting: boolean;
}

export function CreationStudioModal({
  open,
  onClose,
  onSubmit,
  isSubmitting,
}: CreationStudioModalProps) {
  const [premise, setPremise] = useState(
    "失聰的古董鐘錶匠在暴雨夜收到一只會倒轉十秒的懷錶，每一次撥動指針，都能聽見十年前未說出口的那句告別。"
  );
  const [genre, setGenre] = useState(GENRE_OPTIONS[1]);
  const [visualStyle, setVisualStyle] = useState(VISUAL_STYLE_OPTIONS[0].id);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [sceneCount, setSceneCount] = useState(4);
  const [dialogueMode, setDialogueMode] = useState<"dialogue" | "narration">("dialogue");
  const [highQualityImages, setHighQualityImages] = useState(false);
  const [autoGenerateVideo, setAutoGenerateVideo] = useState(false);

  if (!open) return null;

  const applyPreset = (brief: Partial<ProductionBrief>) => {
    if (brief.premise) setPremise(brief.premise);
    if (brief.genre) setGenre(brief.genre);
    if (brief.visualStyle) setVisualStyle(brief.visualStyle);
    if (brief.aspectRatio) setAspectRatio(brief.aspectRatio);
    if (brief.sceneCount) setSceneCount(brief.sceneCount);
    if (brief.dialogueMode) setDialogueMode(brief.dialogueMode);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!premise.trim()) return;
    onSubmit({
      premise: premise.trim(),
      genre,
      visualStyle,
      aspectRatio,
      sceneCount,
      dialogueMode,
      highQualityImages,
      autoGenerateVideo,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="creation-studio-title"
    >
      <div className="w-full max-w-2xl bg-[#111114] border border-zinc-800 rounded-xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Clapperboard className="w-5 h-5 text-amber-400" />
            <h2 id="creation-studio-title" className="text-base font-semibold text-zinc-100">
              新增 AI 影音短劇企劃
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉視窗"
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          {/* Quick Starter Presets */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-zinc-400">快速靈感範本</span>
            <div className="flex flex-wrap gap-2">
              {STORY_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset.brief)}
                  className="px-3 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Story Premise */}
          <div className="space-y-2">
            <label htmlFor="drama-premise" className="block text-xs font-medium text-zinc-300">
              故事核心靈感或劇情大綱
            </label>
            <textarea
              id="drama-premise"
              rows={3}
              required
              value={premise}
              onChange={(e) => setPremise(e.target.value)}
              placeholder="輸入你想拍攝的短劇主題、角色衝突或氛圍場景..."
              className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          {/* Genre & Visual Style */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="drama-genre" className="block text-xs font-medium text-zinc-300">
                題材類型
              </label>
              <select
                id="drama-genre"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
              >
                {GENRE_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="drama-style" className="block text-xs font-medium text-zinc-300">
                攝影視覺美學
              </label>
              <select
                id="drama-style"
                value={visualStyle}
                onChange={(e) => setVisualStyle(e.target.value)}
                className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
              >
                {VISUAL_STYLE_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Aspect Ratio, Scene Count, Dialogue Mode */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <span className="block text-xs font-medium text-zinc-300">畫面比例</span>
              <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-lg">
                {(["16:9", "9:16"] as const).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setAspectRatio(ratio)}
                    className={`py-1.5 text-xs font-mono rounded-md transition-colors cursor-pointer ${
                      aspectRatio === ratio
                        ? "bg-zinc-800 text-amber-400 font-medium"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {ratio === "16:9" ? "16:9 橫屏" : "9:16 直屏"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="scene-count" className="block text-xs font-medium text-zinc-300">
                分場鏡頭數（{sceneCount} 場）
              </label>
              <input
                id="scene-count"
                type="range"
                min={3}
                max={6}
                value={sceneCount}
                onChange={(e) => setSceneCount(Number(e.target.value))}
                className="w-full accent-amber-500 mt-2 cursor-pointer"
              />
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-zinc-300">敘事音軌模式</span>
              <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setDialogueMode("dialogue")}
                  className={`py-1.5 text-xs rounded-md transition-colors cursor-pointer ${
                    dialogueMode === "dialogue"
                      ? "bg-zinc-800 text-amber-400 font-medium"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  雙人對白
                </button>
                <button
                  type="button"
                  onClick={() => setDialogueMode("narration")}
                  className={`py-1.5 text-xs rounded-md transition-colors cursor-pointer ${
                    dialogueMode === "narration"
                      ? "bg-zinc-800 text-amber-400 font-medium"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  電影旁白
                </button>
              </div>
            </div>
          </div>

          {/* Pipeline Options */}
          <div className="pt-2 border-t border-zinc-800/80 space-y-2.5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={highQualityImages}
                onChange={(e) => setHighQualityImages(e.target.checked)}
                className="mt-0.5 rounded border-zinc-700 bg-zinc-950 accent-amber-500"
              />
              <span className="text-xs text-zinc-300">
                啟用高精細分鏡繪製（Nano Banana 2.1 · 1K 劇照級質感）
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoGenerateVideo}
                onChange={(e) => setAutoGenerateVideo(e.target.checked)}
                className="mt-0.5 rounded border-zinc-700 bg-zinc-950 accent-amber-500"
              />
              <span className="text-xs text-zinc-300">
                自動將所有分鏡轉為 Omni 1.2 動態影片（每場約需 30–60 秒；未勾選則先生成可即時運鏡播放的分鏡劇照，可於分鏡室逐場升級）
              </span>
            </label>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-lg text-zinc-300 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !premise.trim()}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-zinc-950 hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isSubmitting ? "管線啟動中..." : "一鍵自動執導生成"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
