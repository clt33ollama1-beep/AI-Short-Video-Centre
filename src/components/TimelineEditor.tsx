import { useMemo } from "react";
import { Film, Loader2, Mic, Music, Pause, Play, RefreshCw, Video } from "lucide-react";
import type { DramaProject } from "../types/director";
import { formatTimecode } from "../utils/exportProduction";

interface TimelineEditorProps {
  project: DramaProject;
  currentTime: number;
  isPlaying: boolean;
  selectedSceneId: string;
  onTimeChange: (time: number) => void;
  onPlayToggle: (playing: boolean) => void;
  onSelectScene: (sceneId: string) => void;
  onUpdateMusicPrompt: (prompt: string) => void;
  onRegenerateMusic: () => void;
  onRegenerateSpeech: (sceneId: string) => void;
  onGenerateVideo: (sceneId: string) => void;
}

export function TimelineEditor({
  project,
  currentTime,
  isPlaying,
  selectedSceneId,
  onTimeChange,
  onPlayToggle,
  onSelectScene,
  onUpdateMusicPrompt,
  onRegenerateMusic,
  onRegenerateSpeech,
  onGenerateVideo,
}: TimelineEditorProps) {
  const totalDuration = useMemo(
    () => project.scenes.reduce((sum, s) => sum + s.durationSec, 0),
    [project.scenes]
  );

  const offsets = useMemo(() => {
    let acc = 0;
    return project.scenes.map((scene) => {
      const start = acc;
      const end = acc + scene.durationSec;
      acc = end;
      return { scene, start, end };
    });
  }, [project.scenes]);

  const playheadPct = totalDuration > 0 ? Math.min(100, (currentTime / totalDuration) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Multi-Track NLE Console */}
      <div className="bg-[#111114] border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onPlayToggle(!isPlaying)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-100 text-zinc-950 text-xs font-medium hover:bg-white transition-colors cursor-pointer"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? "暫停" : "播放時間軸"}</span>
            </button>
            <span className="text-xs font-mono tabular-nums text-zinc-300">
              {formatTimecode(currentTime)} / {formatTimecode(totalDuration)}
            </span>
          </div>

          <div className="text-xs text-zinc-400">
            點擊任意軌道片段可跳轉放映點並快速補強影音資產
          </div>
        </div>

        {/* Ruler + Tracks */}
        <div className="p-5 overflow-x-auto">
          <div className="min-w-[760px] space-y-3 relative">
            {/* Timecode Ruler */}
            <div className="grid grid-cols-[160px_1fr] gap-3 items-center">
              <span className="text-[11px] font-mono text-zinc-500">TIMECODE</span>
              <div className="relative h-6 border-b border-zinc-800 flex items-end justify-between text-[11px] font-mono tabular-nums text-zinc-500 pb-1">
                {offsets.map((o) => (
                  <button
                    key={o.scene.id}
                    type="button"
                    onClick={() => {
                      onTimeChange(o.start);
                      onSelectScene(o.scene.id);
                    }}
                    className="hover:text-amber-400 transition-colors cursor-pointer"
                  >
                    {formatTimecode(o.start)}
                  </button>
                ))}
                <span>{formatTimecode(totalDuration)}</span>
              </div>
            </div>

            {/* Track Area with Playhead */}
            <div className="relative space-y-3">
              {/* Playhead Needle */}
              <div
                className="absolute top-0 bottom-0 left-[172px] right-0 pointer-events-none z-20"
              >
                <div
                  className="absolute top-0 bottom-0 w-px bg-amber-400"
                  style={{ left: `${playheadPct}%` }}
                >
                  <div className="w-2.5 h-2.5 -ml-[4.5px] -mt-1 bg-amber-400 rotate-45" />
                </div>
              </div>

              {/* V1 Visual / Video Track */}
              <div className="grid grid-cols-[160px_1fr] gap-3 items-stretch">
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 flex items-center gap-2 text-xs text-zinc-300">
                  <Film className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">V1 視覺影像軌</span>
                </div>
                <div className="flex gap-1.5">
                  {offsets.map(({ scene, start }) => {
                    const pct = totalDuration > 0 ? (scene.durationSec / totalDuration) * 100 : 25;
                    const isSelected = scene.id === selectedSceneId;
                    return (
                      <div
                        key={scene.id}
                        style={{ width: `${pct}%` }}
                        onClick={() => {
                          onSelectScene(scene.id);
                          onTimeChange(start);
                        }}
                        className={`rounded-lg border p-2.5 bg-zinc-950 transition-colors cursor-pointer flex flex-col justify-between min-h-[72px] ${
                          isSelected ? "border-amber-500" : "border-zinc-800 hover:border-zinc-700"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium text-zinc-200 truncate">
                            #{scene.sceneNumber} {scene.title.replace(/^第.+場\s*·\s*/, "")}
                          </span>
                          <span className="text-[11px] font-mono tabular-nums text-zinc-500 shrink-0">
                            {scene.durationSec}s
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-2">
                          <span className="text-[11px] text-zinc-400 truncate">
                            {scene.videoUrl ? "MP4 動態影片" : scene.imageUrl ? "分鏡劇照" : "待生成"}
                          </span>
                          {!scene.videoUrl && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onGenerateVideo(scene.id);
                              }}
                              disabled={scene.status.video === "generating"}
                              className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 shrink-0 cursor-pointer"
                            >
                              {scene.status.video === "generating" ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Video className="w-3 h-3" />
                              )}
                              <span>動態化</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* A1 Dialogue / TTS Track */}
              <div className="grid grid-cols-[160px_1fr] gap-3 items-stretch">
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 flex items-center gap-2 text-xs text-zinc-300">
                  <Mic className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span className="truncate">A1 角色配音軌</span>
                </div>
                <div className="flex gap-1.5">
                  {offsets.map(({ scene, start }) => {
                    const pct = totalDuration > 0 ? (scene.durationSec / totalDuration) * 100 : 25;
                    return (
                      <div
                        key={scene.id}
                        style={{ width: `${pct}%` }}
                        onClick={() => {
                          onSelectScene(scene.id);
                          onTimeChange(start);
                        }}
                        className="rounded-lg border border-zinc-800 bg-zinc-950/80 hover:border-zinc-700 p-2.5 cursor-pointer flex flex-col justify-between min-h-[64px]"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs text-zinc-300 truncate">
                            {scene.speaker} · {scene.voiceName}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRegenerateSpeech(scene.id);
                            }}
                            disabled={scene.status.audio === "generating"}
                            aria-label="生成配音"
                            className="text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer"
                          >
                            {scene.status.audio === "generating" ? (
                              <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                            ) : (
                              <RefreshCw className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-zinc-500 truncate">
                            {scene.dialogueLine}
                          </span>
                          <span
                            className={`text-[11px] shrink-0 ${
                              scene.audioUrl ? "text-emerald-400" : "text-zinc-600"
                            }`}
                          >
                            {scene.audioUrl ? "WAV 已就緒" : "未配音"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* A2 Lyria Original Score Track */}
              <div className="grid grid-cols-[160px_1fr] gap-3 items-stretch">
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 flex items-center gap-2 text-xs text-zinc-300">
                  <Music className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span className="truncate">A2 原創配樂軌</span>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-zinc-200">Lyria 3 原創電影配樂</span>
                      <span aria-hidden="true" className="text-zinc-600">·</span>
                      <span
                        className={
                          project.musicUrl
                            ? "text-emerald-400"
                            : project.musicStatus === "generating"
                            ? "text-amber-400"
                            : "text-zinc-500"
                        }
                      >
                        {project.musicStatus === "generating"
                          ? "配樂串流生成中..."
                          : project.musicUrl
                          ? "30s MP3 音軌已掛載（對白時自動閃避壓低音量）"
                          : "尚未生成配樂"}
                      </span>
                    </div>
                  </div>
                  {project.musicUrl && (
                    <audio controls src={project.musicUrl} className="h-8 max-w-xs" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Music Score Director Panel */}
      <div className="bg-[#111114] border border-zinc-800 rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Lyria 原創電影配樂指導</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              將結合首場分鏡畫面情緒與以下樂曲提示詞，合成 30 秒電影原聲配樂
            </p>
          </div>
          <button
            type="button"
            onClick={onRegenerateMusic}
            disabled={project.musicStatus === "generating"}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-amber-500 text-zinc-950 hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {project.musicStatus === "generating" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Music className="w-3.5 h-3.5" />
            )}
            <span>
              {project.musicStatus === "generating"
                ? "正在譜曲中..."
                : project.musicUrl
                ? "重新生成原創配樂"
                : "生成原創配樂"}
            </span>
          </button>
        </div>

        <textarea
          rows={2}
          value={project.musicPrompt}
          onChange={(e) => onUpdateMusicPrompt(e.target.value)}
          className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3.5 py-2.5 text-xs font-mono text-zinc-300 focus:outline-none focus:border-amber-500"
        />
        {project.musicError && (
          <p className="text-xs text-rose-400">{project.musicError}</p>
        )}
      </div>
    </div>
  );
}
