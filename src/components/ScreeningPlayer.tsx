import { useEffect, useMemo, useRef, useState } from "react";
import {
  Captions,
  Download,
  Film,
  Maximize2,
  Music,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { DramaProject, DramaScene } from "../types/director";
import { formatTimecode } from "../utils/exportProduction";

interface ScreeningPlayerProps {
  project: DramaProject;
  currentTime: number;
  isPlaying: boolean;
  allowBrowserSpeech?: boolean;
  onTimeChange: (time: number) => void;
  onPlayToggle: (playing: boolean) => void;
  onSelectScene: (sceneId: string) => void;
  onGenerateMissingAudio: () => void;
  onExportBible: () => void;
  onExportWebM: () => void;
  isExportingWebM: boolean;
  exportProgressLabel: string;
  isPipelineRunning: boolean;
}

export function ScreeningPlayer({
  project,
  currentTime,
  isPlaying,
  allowBrowserSpeech = false,
  onTimeChange,
  onPlayToggle,
  onSelectScene,
  onGenerateMissingAudio,
  onExportBible,
  onExportWebM,
  isExportingWebM,
  exportProgressLabel,
  isPipelineRunning,
}: ScreeningPlayerProps) {
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [cinemascope, setCinemascope] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const speechAudioRef = useRef<HTMLAudioElement | null>(null);
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSpokenSceneIdRef = useRef<string | null>(null);
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  const sceneOffsets = useMemo(() => {
    let acc = 0;
    return project.scenes.map((scene) => {
      const start = acc;
      const end = acc + scene.durationSec;
      acc = end;
      return { scene, start, end };
    });
  }, [project.scenes]);

  const totalDuration = useMemo(
    () => project.scenes.reduce((sum, s) => sum + s.durationSec, 0),
    [project.scenes]
  );

  const activeEntry = useMemo(() => {
    if (sceneOffsets.length === 0) return null;
    return (
      sceneOffsets.find((entry) => currentTime >= entry.start && currentTime < entry.end) ??
      sceneOffsets[sceneOffsets.length - 1]
    );
  }, [sceneOffsets, currentTime]);

  const activeScene: DramaScene | null = activeEntry?.scene ?? null;
  const activeSceneLocalTime = activeEntry ? Math.max(0, currentTime - activeEntry.start) : 0;

  // Master playback timer loop
  useEffect(() => {
    if (!isPlaying || totalDuration <= 0) return;

    let rafId = 0;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastTs) / 1000;
      lastTs = now;
      const next = currentTimeRef.current + dt;
      if (next >= totalDuration) {
        onTimeChange(0);
        onPlayToggle(false);
        return;
      }
      onTimeChange(next);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, totalDuration, onTimeChange, onPlayToggle]);

  // Sync Lyria BGM playback and smooth ducking
  useEffect(() => {
    const bgm = bgmAudioRef.current;
    if (!bgm) return;

    bgm.muted = isMuted;
    const hasActiveSpeech = (Boolean(activeScene?.audioUrl) || allowBrowserSpeech) && isPlaying;
    bgm.volume = hasActiveSpeech ? 0.22 : 0.48;

    if (isPlaying && project.musicUrl) {
      if (bgm.paused) {
        void bgm.play().catch(() => {});
      }
    } else {
      if (!bgm.paused) {
        bgm.pause();
      }
    }
  }, [isPlaying, isMuted, project.musicUrl, activeScene?.audioUrl, allowBrowserSpeech]);

  // Trigger scene speech audio whenever entering a scene while playing
  useEffect(() => {
    const speech = speechAudioRef.current;
    if (!speech) return;
    speech.muted = isMuted;

    if (!isPlaying || !activeScene) {
      speech.pause();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (!isPlaying) {
        lastSpokenSceneIdRef.current = null;
      }
      return;
    }

    if (lastSpokenSceneIdRef.current !== activeScene.id) {
      lastSpokenSceneIdRef.current = activeScene.id;
      if (activeScene.audioUrl) {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
        speech.src = activeScene.audioUrl;
        speech.currentTime = Math.min(activeSceneLocalTime, 0.5);
        void speech.play().catch(() => {});
      } else {
        speech.pause();
        if (
          allowBrowserSpeech &&
          !isMuted &&
          activeScene.dialogueLine &&
          typeof window !== "undefined" &&
          "speechSynthesis" in window
        ) {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(activeScene.dialogueLine);
          utter.lang = "zh-TW";
          utter.rate = 0.98;
          window.speechSynthesis.speak(utter);
        }
      }
    }
  }, [isPlaying, activeScene, activeSceneLocalTime, isMuted, allowBrowserSpeech]);

  // Sync video element when a scene has an Omni-generated MP4 clip
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !activeScene?.videoUrl) return;
    if (isPlaying) {
      if (vid.paused) {
        vid.currentTime = Math.min(activeSceneLocalTime, vid.duration || 10);
        void vid.play().catch(() => {});
      }
    } else {
      vid.pause();
    }
  }, [isPlaying, activeScene?.id, activeScene?.videoUrl, activeSceneLocalTime]);

  const missingAudioCount = useMemo(() => {
    const missingSpeech = project.scenes.filter((s) => !s.audioUrl).length;
    const missingMusic = project.musicUrl ? 0 : 1;
    return missingSpeech + missingMusic;
  }, [project.scenes, project.musicUrl]);

  const isVertical = project.aspectRatio === "9:16";

  const motionClass =
    !isPlaying || activeScene?.videoUrl
      ? ""
      : activeScene?.motionEffect === "pan"
      ? "cinema-motion-pan"
      : activeScene?.motionEffect === "pull"
      ? "cinema-motion-pull"
      : "cinema-motion-zoom";

  const jumpToSceneOffset = (delta: number) => {
    if (!activeEntry || sceneOffsets.length === 0) return;
    const idx = sceneOffsets.findIndex((e) => e.scene.id === activeEntry.scene.id);
    const nextIdx = Math.max(0, Math.min(sceneOffsets.length - 1, idx + delta));
    lastSpokenSceneIdRef.current = null;
    onTimeChange(sceneOffsets[nextIdx].start);
    onSelectScene(sceneOffsets[nextIdx].scene.id);
  };

  return (
    <section className="space-y-4">
      <audio ref={speechAudioRef} preload="auto" />
      {project.musicUrl && <audio ref={bgmAudioRef} src={project.musicUrl} loop preload="auto" />}

      {/* Cinema Screening Frame */}
      <div className="bg-[#111114] border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-zinc-800/90 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span>{project.genre}</span>
              <span aria-hidden="true">·</span>
              <span>{project.visualStyle}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{project.aspectRatio}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{project.scenes.length} 場</span>
            </div>
            <h1 className="text-lg font-semibold text-zinc-100 tracking-tight truncate mt-0.5">
              {project.title}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {missingAudioCount > 0 && (
              <button
                type="button"
                onClick={onGenerateMissingAudio}
                disabled={isPipelineRunning}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-amber-500 text-zinc-950 hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>生成全部語音與配樂</span>
              </button>
            )}
            <button
              type="button"
              onClick={onExportBible}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-zinc-900 text-zinc-200 border border-zinc-800 hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>劇本手冊</span>
            </button>
            <button
              type="button"
              onClick={onExportWebM}
              disabled={isExportingWebM || project.scenes.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-zinc-900 text-zinc-200 border border-zinc-800 hover:bg-zinc-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Film className="w-3.5 h-3.5 text-amber-400" />
              <span>{isExportingWebM ? "渲染合成中..." : "匯出成片 (.webm)"}</span>
            </button>
          </div>
        </div>

        {/* Viewport Canvas */}
        <div className="bg-black flex items-center justify-center p-4 sm:p-6">
          <div
            className={`relative overflow-hidden bg-zinc-950 border border-zinc-800/80 rounded-lg shadow-2xl ${
              isVertical ? "w-full max-w-[340px] aspect-[9/16]" : "w-full max-w-[1040px] aspect-video"
            }`}
          >
            {activeScene?.videoUrl ? (
              <video
                key={activeScene.id + activeScene.videoUrl}
                ref={videoRef}
                src={activeScene.videoUrl}
                muted
                playsInline
                loop
                className="w-full h-full object-cover"
              />
            ) : activeScene?.imageUrl ? (
              <img
                key={activeScene.id + (isPlaying ? "-play" : "-pause")}
                src={activeScene.imageUrl}
                alt={activeScene.title}
                referrerPolicy="no-referrer"
                className={`w-full h-full object-cover will-change-transform ${motionClass}`}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black text-zinc-500 p-6 text-center">
                <Film className="w-8 h-8 text-zinc-700" />
                <p className="text-sm text-zinc-400">{activeScene?.title ?? "尚未選擇分鏡"}</p>
                <p className="text-xs text-zinc-600 max-w-md">
                  {activeScene?.status.image === "generating"
                    ? "正在繪製此場電影關鍵影格..."
                    : "於分鏡導演室點擊「生成分鏡圖」即可產生視覺畫面"}
                </p>
              </div>
            )}

            {/* Optional 2.39:1 Anamorphic Cinema Bars */}
            {cinemascope && !isVertical && (
              <>
                <div className="absolute top-0 inset-x-0 h-[11%] bg-black pointer-events-none transition-opacity" />
                <div className="absolute bottom-0 inset-x-0 h-[11%] bg-black pointer-events-none transition-opacity" />
              </>
            )}

            {/* Measured Scrim & Subtitles */}
            {showSubtitles && activeScene && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent pt-16 pb-6 px-6 pointer-events-none">
                <div className="max-w-2xl mx-auto text-center space-y-1">
                  <p className="text-xs font-medium tracking-wide text-amber-400">
                    {activeScene.speaker}
                  </p>
                  <p className="text-base sm:text-xl font-medium text-zinc-50 leading-relaxed drop-shadow">
                    {activeScene.dialogueLine}
                  </p>
                </div>
              </div>
            )}

            {/* Scene Head-up Metadata (unboxed text, clean contrast scrim) */}
            {activeScene && (
              <div className="absolute top-3 left-4 right-4 flex items-center justify-between text-xs text-zinc-200/90 pointer-events-none drop-shadow">
                <span>
                  第 {String(activeScene.sceneNumber).padStart(2, "0")} 場 · {activeScene.shotType}
                </span>
                <span className="font-mono tabular-nums">
                  {activeScene.videoUrl ? "動態影片" : "關鍵影格"} ·{" "}
                  {activeScene.audioUrl ? "已配音" : "待配音"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Transport & Scrubber Bar */}
        <div className="px-5 py-3.5 border-t border-zinc-800/90 space-y-3 bg-[#111114]">
          {/* Interactive Timeline Scrubber */}
          <div className="space-y-1.5">
            <div className="relative h-2 bg-zinc-900 rounded-full overflow-hidden flex cursor-pointer">
              {sceneOffsets.map((entry) => {
                const widthPct = totalDuration > 0 ? (entry.scene.durationSec / totalDuration) * 100 : 0;
                const isActive = activeScene?.id === entry.scene.id;
                const localProgress = isActive
                  ? Math.min(1, Math.max(0, (currentTime - entry.start) / entry.scene.durationSec))
                  : currentTime >= entry.end
                  ? 1
                  : 0;

                return (
                  <button
                    key={entry.scene.id}
                    type="button"
                    aria-label={`跳轉至 ${entry.scene.title}`}
                    onClick={() => {
                      lastSpokenSceneIdRef.current = null;
                      onTimeChange(entry.start);
                      onSelectScene(entry.scene.id);
                    }}
                    style={{ width: `${widthPct}%` }}
                    className="relative h-full border-r border-zinc-950 last:border-r-0 bg-zinc-800/80 hover:bg-zinc-700/80 transition-colors cursor-pointer"
                  >
                    <div
                      className="h-full bg-amber-500 transition-[width] duration-75"
                      style={{ width: `${localProgress * 100}%` }}
                    />
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-500 font-mono tabular-nums">
              <span>{formatTimecode(currentTime)}</span>
              {isExportingWebM ? (
                <span className="text-amber-400 font-sans">{exportProgressLabel}</span>
              ) : (
                <span className="font-sans text-zinc-400 truncate max-w-md">
                  {activeScene?.sfxCue ? `音效：${activeScene.sfxCue}` : project.logline}
                </span>
              )}
              <span>{formatTimecode(totalDuration)}</span>
            </div>
          </div>

          {/* Playback Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => jumpToSceneOffset(-1)}
                aria-label="上一場"
                className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onPlayToggle(!isPlaying)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-100 text-zinc-950 font-medium text-xs hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{isPlaying ? "暫停放映" : "播放短劇"}</span>
              </button>
              <button
                type="button"
                onClick={() => jumpToSceneOffset(1)}
                aria-label="下一場"
                className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="hidden sm:inline-flex items-center gap-1.5 mr-2">
                <Music className="w-3.5 h-3.5 text-zinc-500" />
                <span>
                  {project.musicStatus === "generating"
                    ? "Lyria 配樂生成中..."
                    : project.musicUrl
                    ? "Lyria 原創配樂已同步"
                    : "尚未生成 Lyria 配樂"}
                </span>
              </span>

              <button
                type="button"
                onClick={() => setIsMuted((m) => !m)}
                aria-label={isMuted ? "取消靜音" : "靜音"}
                className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                  isMuted
                    ? "bg-zinc-800 text-zinc-100 border-zinc-700"
                    : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                }`}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setShowSubtitles((s) => !s)}
                aria-label="切換字幕"
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showSubtitles
                    ? "bg-zinc-800 text-zinc-100 border-zinc-700"
                    : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                }`}
              >
                <Captions className="w-3.5 h-3.5" />
                <span>字幕</span>
              </button>
              {!isVertical && (
                <button
                  type="button"
                  onClick={() => setCinemascope((c) => !c)}
                  aria-label="切換寬銀幕遮幅"
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    cinemascope
                      ? "bg-zinc-800 text-zinc-100 border-zinc-700"
                      : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                  }`}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>2.39:1</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
