import { useMemo } from "react";
import {
  Film,
  Image as ImageIcon,
  Loader2,
  Mic,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Video,
} from "lucide-react";
import { VOICE_OPTIONS } from "../data/showcaseProject";
import type { AspectRatio, DramaScene, MotionEffect, VoiceName } from "../types/director";

interface StoryboardBoardProps {
  scenes: DramaScene[];
  aspectRatio: AspectRatio;
  selectedSceneId: string;
  onSelectScene: (sceneId: string) => void;
  onUpdateScene: (sceneId: string, patch: Partial<DramaScene>) => void;
  onRegenerateImage: (sceneId: string) => void;
  onGenerateVideo: (sceneId: string) => void;
  onRegenerateSpeech: (sceneId: string) => void;
  onPreviewScene: (sceneId: string) => void;
  onAddScene: () => void;
  onDeleteScene: (sceneId: string) => void;
}

export function StoryboardBoard({
  scenes,
  aspectRatio,
  selectedSceneId,
  onSelectScene,
  onUpdateScene,
  onRegenerateImage,
  onGenerateVideo,
  onRegenerateSpeech,
  onPreviewScene,
  onAddScene,
  onDeleteScene,
}: StoryboardBoardProps) {
  const selectedScene = useMemo(
    () => scenes.find((s) => s.id === selectedSceneId) ?? scenes[0] ?? null,
    [scenes, selectedSceneId]
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left: Shot Grid */}
      <div className="xl:col-span-7 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">分場分鏡總覽</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              點擊任一鏡頭以微調台詞、運鏡提示詞或個別升級為 Omni 動態影像
            </p>
          </div>
          <button
            type="button"
            onClick={onAddScene}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新增場次</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {scenes.map((scene) => {
            const isSelected = selectedScene?.id === scene.id;
            const isVertical = aspectRatio === "9:16";

            return (
              <div
                key={scene.id}
                onClick={() => onSelectScene(scene.id)}
                className={`group rounded-xl border bg-[#111114] overflow-hidden transition-colors cursor-pointer ${
                  isSelected
                    ? "border-amber-500/80"
                    : "border-zinc-800 hover:border-zinc-700"
                }`}
              >
                {/* Frame Preview */}
                <div
                  className={`relative bg-zinc-950 overflow-hidden ${
                    isVertical ? "aspect-[9/12]" : "aspect-video"
                  }`}
                >
                  {scene.videoUrl ? (
                    <video
                      src={scene.videoUrl}
                      muted
                      loop
                      playsInline
                      onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
                      onMouseLeave={(e) => e.currentTarget.pause()}
                      className="w-full h-full object-cover"
                    />
                  ) : scene.imageUrl ? (
                    <img
                      src={scene.imageUrl}
                      alt={scene.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-zinc-900 to-zinc-950 text-zinc-500 p-4 text-center">
                      {scene.status.image === "generating" ? (
                        <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                      ) : (
                        <Film className="w-6 h-6 text-zinc-700" />
                      )}
                      <span className="text-xs text-zinc-400">
                        {scene.status.image === "generating"
                          ? "正在繪製電影分鏡..."
                          : "等待生成分鏡影像"}
                      </span>
                    </div>
                  )}

                  {/* Scrim + Clean Metadata */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-3.5 py-2.5 flex items-center justify-between text-xs text-zinc-200">
                    <span className="font-mono tabular-nums">
                      #{String(scene.sceneNumber).padStart(2, "0")} · {scene.durationSec}s
                    </span>
                    <span>
                      {scene.videoUrl ? "動態影片就緒" : scene.imageUrl ? "劇照就緒" : "未生成"}
                      {" · "}
                      {scene.audioUrl ? "已配音" : "未配音"}
                    </span>
                  </div>
                </div>

                {/* Card Copy */}
                <div className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-zinc-100 truncate">
                        {scene.title}
                      </h3>
                      <p className="text-xs text-zinc-500 truncate mt-0.5">{scene.shotType}</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPreviewScene(scene.id);
                      }}
                      aria-label={`放映 ${scene.title}`}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-zinc-900 transition-colors shrink-0 cursor-pointer"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-xs text-zinc-300 leading-relaxed line-clamp-2">
                    <span className="text-amber-400 font-medium">{scene.speaker}：</span>
                    {scene.dialogueLine}
                  </p>

                  {scene.status.errorMessage && (
                    <p className="text-xs text-rose-400 leading-snug">
                      {scene.status.errorMessage}
                    </p>
                  )}

                  <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRegenerateImage(scene.id);
                      }}
                      disabled={scene.status.image === "generating"}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {scene.status.image === "generating" ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <ImageIcon className="w-3 h-3" />
                      )}
                      <span>{scene.imageUrl ? "重繪" : "繪製"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onGenerateVideo(scene.id);
                      }}
                      disabled={scene.status.video === "generating"}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-amber-400 hover:bg-zinc-800 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {scene.status.video === "generating" ? (
                        <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                      ) : (
                        <Video className="w-3 h-3" />
                      )}
                      <span>
                        {scene.status.video === "generating"
                          ? "轉動態中..."
                          : scene.videoUrl
                          ? "重製影片"
                          : "Omni 動態化"}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRegenerateSpeech(scene.id);
                      }}
                      disabled={scene.status.audio === "generating"}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {scene.status.audio === "generating" ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Mic className="w-3 h-3" />
                      )}
                      <span>{scene.audioUrl ? "重配音" : "生成配音"}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Scene Director Inspector */}
      <div className="xl:col-span-5 bg-[#111114] border border-zinc-800 rounded-xl p-5 space-y-5 sticky top-6">
        {selectedScene ? (
          <>
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-zinc-800">
              <div>
                <p className="text-xs text-amber-400 font-mono tabular-nums">
                  第 {String(selectedScene.sceneNumber).padStart(2, "0")} 場導演細修面板
                </p>
                <h3 className="text-base font-semibold text-zinc-100 mt-0.5">
                  {selectedScene.title}
                </h3>
              </div>
              {scenes.length > 1 && (
                <button
                  type="button"
                  onClick={() => onDeleteScene(selectedScene.id)}
                  aria-label="刪除此場次"
                  className="p-2 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-zinc-900 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs text-zinc-400">場次標題</label>
                <input
                  type="text"
                  value={selectedScene.title}
                  onChange={(e) => onUpdateScene(selectedScene.id, { title: e.target.value })}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs text-zinc-400">鏡位與焦段</label>
                <input
                  type="text"
                  value={selectedScene.shotType}
                  onChange={(e) => onUpdateScene(selectedScene.id, { shotType: e.target.value })}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs text-zinc-400">
                  場次時長（{selectedScene.durationSec} 秒）
                </label>
                <input
                  type="range"
                  min={3}
                  max={10}
                  value={selectedScene.durationSec}
                  onChange={(e) =>
                    onUpdateScene(selectedScene.id, { durationSec: Number(e.target.value) })
                  }
                  className="w-full accent-amber-500 mt-2 cursor-pointer"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs text-zinc-400">靜態運鏡軌跡</label>
                <select
                  value={selectedScene.motionEffect}
                  onChange={(e) =>
                    onUpdateScene(selectedScene.id, {
                      motionEffect: e.target.value as MotionEffect,
                    })
                  }
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="zoom">緩慢推鏡 (Push-in)</option>
                  <option value="pan">橫向搖鏡 (Pan)</option>
                  <option value="pull">緩慢拉遠 (Pull-out)</option>
                </select>
              </div>
            </div>

            {/* Dialogue & TTS Voice */}
            <div className="pt-4 border-t border-zinc-800 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs text-zinc-400">說話角色</label>
                  <input
                    type="text"
                    value={selectedScene.speaker}
                    onChange={(e) => onUpdateScene(selectedScene.id, { speaker: e.target.value })}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs text-zinc-400">Gemini TTS 聲線</label>
                  <select
                    value={selectedScene.voiceName}
                    onChange={(e) =>
                      onUpdateScene(selectedScene.id, { voiceName: e.target.value as VoiceName })
                    }
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                  >
                    {VOICE_OPTIONS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs text-zinc-400">語氣與表演指導</label>
                <input
                  type="text"
                  value={selectedScene.voiceStyle}
                  onChange={(e) => onUpdateScene(selectedScene.id, { voiceStyle: e.target.value })}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs text-zinc-400">角色台詞 / 旁白文字</label>
                  <button
                    type="button"
                    onClick={() => onRegenerateSpeech(selectedScene.id)}
                    disabled={selectedScene.status.audio === "generating"}
                    className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>套用並重新配音</span>
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={selectedScene.dialogueLine}
                  onChange={(e) =>
                    onUpdateScene(selectedScene.id, { dialogueLine: e.target.value })
                  }
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-zinc-100 leading-relaxed focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Visual & Omni Motion Prompts */}
            <div className="pt-4 border-t border-zinc-800 space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs text-zinc-400">分鏡視覺提示詞（English）</label>
                  <button
                    type="button"
                    onClick={() => onRegenerateImage(selectedScene.id)}
                    disabled={selectedScene.status.image === "generating"}
                    className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>依提示詞重繪</span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={selectedScene.visualPrompt}
                  onChange={(e) =>
                    onUpdateScene(selectedScene.id, { visualPrompt: e.target.value })
                  }
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-zinc-300 font-mono leading-relaxed focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs text-zinc-400">
                    Omni 1.2 動態運鏡提示詞（English）
                  </label>
                  <button
                    type="button"
                    onClick={() => onGenerateVideo(selectedScene.id)}
                    disabled={selectedScene.status.video === "generating"}
                    className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
                  >
                    <Video className="w-3 h-3" />
                    <span>生成動態片段</span>
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={selectedScene.videoMotionPrompt}
                  onChange={(e) =>
                    onUpdateScene(selectedScene.id, { videoMotionPrompt: e.target.value })
                  }
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs text-zinc-300 font-mono leading-relaxed focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-zinc-500">尚未選擇任何場次。</p>
        )}
      </div>
    </div>
  );
}
