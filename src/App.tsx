import { useCallback, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clapperboard, Cpu, Loader2, Sparkles, Video, X } from "lucide-react";
import { CreationStudioModal } from "./components/CreationStudioModal";
import { LocalModelModal } from "./components/LocalModelModal";
import { ScreeningPlayer } from "./components/ScreeningPlayer";
import { StoryboardBoard } from "./components/StoryboardBoard";
import { TimelineEditor } from "./components/TimelineEditor";
import { SHOWCASE_PROJECT, VISUAL_STYLE_OPTIONS } from "./data/showcaseProject";
import type {
  DramaProject,
  DramaScene,
  EnginePreferences,
  MotionEffect,
  PipelineProgress,
  ProductionBrief,
  VoiceName,
} from "./types/director";
import {
  generateMusicApi,
  generateScriptApi,
  generateSpeechApi,
  generateStoryboardApi,
  generateVideoApi,
} from "./utils/api";
import {
  exportProductionBible,
  formatTimecode,
  renderAndDownloadWebM,
} from "./utils/exportProduction";
import { loadEnginePreferences, saveEnginePreferences } from "./utils/localRuntime";

type ViewTab = "screening" | "storyboard" | "timeline" | "script";

const VALID_VOICES: VoiceName[] = ["Puck", "Charon", "Kore", "Fenrir", "Zephyr"];
const VALID_MOTIONS: MotionEffect[] = ["zoom", "pan", "pull"];

export default function App() {
  const [projects, setProjects] = useState<DramaProject[]>([SHOWCASE_PROJECT]);
  const [activeProjectId, setActiveProjectId] = useState<string>(SHOWCASE_PROJECT.id);
  const [activeTab, setActiveTab] = useState<ViewTab>("screening");
  const [selectedSceneId, setSelectedSceneId] = useState<string>(
    SHOWCASE_PROJECT.scenes[0].id
  );

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEngineModalOpen, setIsEngineModalOpen] = useState(false);
  const [enginePrefs, setEnginePrefs] = useState<EnginePreferences>(() =>
    loadEnginePreferences()
  );

  const [pipeline, setPipeline] = useState<PipelineProgress>({
    active: false,
    currentStep: "",
    completedCount: 0,
    totalCount: 0,
  });

  const [isExportingWebM, setIsExportingWebM] = useState(false);
  const [exportProgressLabel, setExportProgressLabel] = useState("");
  const [bannerError, setBannerError] = useState<string | null>(null);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? projects[0],
    [projects, activeProjectId]
  );

  const updateProject = useCallback(
    (projectId: string, updater: (prev: DramaProject) => DramaProject) => {
      setProjects((prevList) =>
        prevList.map((proj) => (proj.id === projectId ? updater(proj) : proj))
      );
    },
    []
  );

  const updateScene = useCallback(
    (projectId: string, sceneId: string, updater: (prev: DramaScene) => DramaScene) => {
      updateProject(projectId, (proj) => ({
        ...proj,
        scenes: proj.scenes.map((sc) => (sc.id === sceneId ? updater(sc) : sc)),
      }));
    },
    [updateProject]
  );

  // Per-scene image regeneration
  const handleRegenerateImage = async (sceneId: string) => {
    const project = activeProject;
    const scene = project.scenes.find((s) => s.id === sceneId);
    if (!scene) return;

    setBannerError(null);
    updateScene(project.id, sceneId, (sc) => ({
      ...sc,
      status: { ...sc.status, image: "generating", errorMessage: undefined },
    }));

    try {
      const anchorImage =
        scene.sceneNumber > 1 ? project.scenes[0]?.imageUrl : undefined;
      const styleHint =
        VISUAL_STYLE_OPTIONS.find((v) => v.id === project.visualStyle)?.promptHint ?? "";
      const fullPrompt = styleHint
        ? `${scene.visualPrompt}. Visual style: ${styleHint}`
        : scene.visualPrompt;

      const { imageUrl } = await generateStoryboardApi(
        {
          prompt: fullPrompt,
          aspectRatio: project.aspectRatio,
          referenceImageDataUrl: anchorImage,
        },
        enginePrefs
      );

      updateScene(project.id, sceneId, (sc) => ({
        ...sc,
        imageUrl,
        videoUrl: undefined,
        status: { ...sc.status, image: "ready", video: "idle" },
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "分鏡圖生成失敗";
      updateScene(project.id, sceneId, (sc) => ({
        ...sc,
        status: { ...sc.status, image: "error", errorMessage: msg },
      }));
      setBannerError(msg);
    }
  };

  // Per-scene Omni 1.2 Flash video generation
  const handleGenerateVideo = async (sceneId: string) => {
    const project = activeProject;
    const scene = project.scenes.find((s) => s.id === sceneId);
    if (!scene) return;

    setBannerError(null);
    updateScene(project.id, sceneId, (sc) => ({
      ...sc,
      status: { ...sc.status, video: "generating", errorMessage: undefined },
    }));

    try {
      const { videoUrl } = await generateVideoApi(
        {
          prompt: scene.videoMotionPrompt || scene.visualPrompt,
          imageDataUrl: scene.imageUrl,
          aspectRatio: project.aspectRatio,
          durationSec: scene.durationSec,
        },
        enginePrefs
      );

      updateScene(project.id, sceneId, (sc) => ({
        ...sc,
        videoUrl,
        status: { ...sc.status, video: "ready" },
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "動態影像生成失敗";
      updateScene(project.id, sceneId, (sc) => ({
        ...sc,
        status: { ...sc.status, video: "error", errorMessage: msg },
      }));
      setBannerError(msg);
    }
  };

  // Per-scene TTS voiceover generation
  const handleRegenerateSpeech = async (sceneId: string) => {
    const project = activeProject;
    const scene = project.scenes.find((s) => s.id === sceneId);
    if (!scene) return;

    setBannerError(null);
    updateScene(project.id, sceneId, (sc) => ({
      ...sc,
      status: { ...sc.status, audio: "generating", errorMessage: undefined },
    }));

    try {
      const { audioUrl } = await generateSpeechApi(
        {
          text: scene.dialogueLine,
          voiceName: scene.voiceName,
          voiceStyle: scene.voiceStyle,
          expressive: true,
        },
        enginePrefs
      );

      updateScene(project.id, sceneId, (sc) => ({
        ...sc,
        audioUrl,
        status: { ...sc.status, audio: "ready" },
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "語音合成失敗";
      updateScene(project.id, sceneId, (sc) => ({
        ...sc,
        status: { ...sc.status, audio: "error", errorMessage: msg },
      }));
      setBannerError(msg);
    }
  };

  // Project-wide Lyria original score generation
  const handleRegenerateMusic = async (targetProject?: DramaProject) => {
    const project = targetProject ?? activeProject;
    setBannerError(null);
    updateProject(project.id, (p) => ({
      ...p,
      musicStatus: "generating",
      musicError: undefined,
    }));

    try {
      const { audioUrl } = await generateMusicApi(
        {
          prompt: project.musicPrompt,
          referenceImageDataUrl: project.scenes[0]?.imageUrl,
        },
        enginePrefs
      );
      updateProject(project.id, (p) => ({
        ...p,
        musicUrl: audioUrl,
        musicStatus: "ready",
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "配樂生成失敗";
      updateProject(project.id, (p) => ({
        ...p,
        musicStatus: "error",
        musicError: msg,
      }));
      setBannerError(msg);
    }
  };

  // Generate missing TTS + Lyria music for the active project
  const handleGenerateMissingAudio = async () => {
    const project = activeProject;
    const missingScenes = project.scenes.filter((s) => !s.audioUrl);
    const needMusic = !project.musicUrl;
    const total = missingScenes.length + (needMusic ? 1 : 0);
    if (total === 0) return;

    setBannerError(null);
    let done = 0;
    setPipeline({
      active: true,
      currentStep: "正在合成角色對白與原創電影配樂...",
      completedCount: 0,
      totalCount: total,
    });

    try {
      // Run speech clips in parallel (skip HTTP TTS if local browser_speech mode is selected)
      const useBrowserSpeechOnly =
        enginePrefs.speechProvider === "local" &&
        enginePrefs.local.ttsProvider === "browser_speech";

      if (!useBrowserSpeechOnly) {
        await Promise.all(
          missingScenes.map(async (scene) => {
            updateScene(project.id, scene.id, (sc) => ({
              ...sc,
              status: { ...sc.status, audio: "generating", errorMessage: undefined },
            }));
            try {
              const { audioUrl } = await generateSpeechApi(
                {
                  text: scene.dialogueLine,
                  voiceName: scene.voiceName,
                  voiceStyle: scene.voiceStyle,
                  expressive: true,
                },
                enginePrefs
              );
              updateScene(project.id, scene.id, (sc) => ({
                ...sc,
                audioUrl,
                status: { ...sc.status, audio: "ready" },
              }));
            } catch (err) {
              const msg = err instanceof Error ? err.message : "配音失敗";
              updateScene(project.id, scene.id, (sc) => ({
                ...sc,
                status: { ...sc.status, audio: "error", errorMessage: msg },
              }));
              throw err;
            } finally {
              done += 1;
              setPipeline((prev) => ({ ...prev, completedCount: done }));
            }
          })
        );
      } else {
        done += missingScenes.length;
        setPipeline((prev) => ({ ...prev, completedCount: done }));
      }

      if (needMusic) {
        setPipeline((prev) => ({
          ...prev,
          currentStep: "正在使用 Lyria 譜寫 30 秒電影原聲配樂...",
        }));
        await handleRegenerateMusic(project);
        done += 1;
        setPipeline((prev) => ({ ...prev, completedCount: done }));
      }

      setPipeline({
        active: false,
        currentStep: "全片語音與原創配樂合成完成",
        completedCount: total,
        totalCount: total,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "影音配音合成失敗";
      setBannerError(msg);
      setPipeline({
        active: false,
        currentStep: "",
        completedCount: done,
        totalCount: total,
        error: msg,
      });
    }
  };

  // Full Automated End-to-End Short Drama Creation Pipeline
  const handleCreateAutomatedDrama = async (brief: ProductionBrief) => {
    setIsCreateOpen(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setBannerError(null);

    const stepsPerScene = brief.autoGenerateVideo ? 3 : 2; // image + speech (+ video)
    const totalTasks = 1 + brief.sceneCount * stepsPerScene + 1; // script + scene assets + music
    let completed = 0;

    setPipeline({
      active: true,
      currentStep:
        enginePrefs.scriptProvider === "local"
          ? `步驟 1/4：本地模型（${enginePrefs.local.llmModel}）正在撰寫劇本與分鏡...`
          : "步驟 1/4：Gemini 4 編導正在撰寫劇本、台詞與分鏡腳本...",
      completedCount: 0,
      totalCount: totalTasks,
    });

    try {
      const { production } = await generateScriptApi(brief, enginePrefs);
      completed += 1;

      const projectId = `proj-${Date.now()}`;
      const newScenes: DramaScene[] = production.scenes.map((sc, index) => {
        const safeVoice = VALID_VOICES.includes(sc.voiceName as VoiceName)
          ? (sc.voiceName as VoiceName)
          : "Charon";
        const safeMotion = VALID_MOTIONS.includes(sc.motionEffect as MotionEffect)
          ? (sc.motionEffect as MotionEffect)
          : "zoom";

        return {
          id: `${projectId}-sc-${index + 1}`,
          sceneNumber: sc.sceneNumber || index + 1,
          title: sc.title,
          shotType: sc.shotType,
          durationSec: Math.min(10, Math.max(4, sc.durationSec || 6)),
          motionEffect: safeMotion,
          visualPrompt: sc.visualPrompt,
          videoMotionPrompt: sc.videoMotionPrompt,
          speaker: sc.speaker,
          voiceName: safeVoice,
          voiceStyle: sc.voiceStyle,
          dialogueLine: sc.dialogueLine,
          sfxCue: sc.sfxCue,
          status: {
            image: "generating",
            video: brief.autoGenerateVideo ? "generating" : "idle",
            audio: "generating",
          },
        };
      });

      const newProject: DramaProject = {
        id: projectId,
        title: production.title,
        premise: brief.premise,
        genre: brief.genre,
        visualStyle: brief.visualStyle,
        aspectRatio: brief.aspectRatio,
        logline: production.logline,
        directorVision: production.directorVision,
        musicPrompt: production.musicPrompt,
        musicStatus: "generating",
        characters: production.characters.map((c) => ({
          ...c,
          voiceName: VALID_VOICES.includes(c.voiceName as VoiceName)
            ? (c.voiceName as VoiceName)
            : "Charon",
        })),
        scenes: newScenes,
        createdAt: new Date().toISOString(),
      };

      setProjects((prev) => [newProject, ...prev]);
      setActiveProjectId(projectId);
      setSelectedSceneId(newScenes[0]?.id ?? "");
      setActiveTab("screening");

      // Step 2: Generate first keyframe as style anchor, then remaining keyframes in parallel
      setPipeline((prev) => ({
        ...prev,
        completedCount: completed,
        currentStep: "步驟 2/4：正在繪製高一致性電影分鏡影格...",
      }));

      const styleHint =
        VISUAL_STYLE_OPTIONS.find((v) => v.id === brief.visualStyle)?.promptHint ?? "";
      let anchorImageUrl: string | undefined;

      if (newScenes.length > 0) {
        const first = newScenes[0];
        const res0 = await generateStoryboardApi(
          {
            prompt: styleHint ? `${first.visualPrompt}. Style: ${styleHint}` : first.visualPrompt,
            aspectRatio: brief.aspectRatio,
            highQuality: brief.highQualityImages,
          },
          enginePrefs
        );
        anchorImageUrl = res0.imageUrl;
        completed += 1;
        updateScene(projectId, first.id, (sc) => ({
          ...sc,
          imageUrl: res0.imageUrl,
          status: { ...sc.status, image: "ready" },
        }));
        setPipeline((prev) => ({ ...prev, completedCount: completed }));
      }

      const restScenes = newScenes.slice(1);
      await Promise.all(
        restScenes.map(async (scene) => {
          try {
            const res = await generateStoryboardApi(
              {
                prompt: styleHint
                  ? `${scene.visualPrompt}. Style: ${styleHint}`
                  : scene.visualPrompt,
                aspectRatio: brief.aspectRatio,
                highQuality: brief.highQualityImages,
                referenceImageDataUrl: anchorImageUrl,
              },
              enginePrefs
            );
            updateScene(projectId, scene.id, (sc) => ({
              ...sc,
              imageUrl: res.imageUrl,
              status: { ...sc.status, image: "ready" },
            }));
          } catch (err) {
            const msg = err instanceof Error ? err.message : "分鏡生成失敗";
            updateScene(projectId, scene.id, (sc) => ({
              ...sc,
              status: { ...sc.status, image: "error", errorMessage: msg },
            }));
          } finally {
            completed += 1;
            setPipeline((prev) => ({ ...prev, completedCount: completed }));
          }
        })
      );

      // Step 3: Generate TTS voiceovers + Lyria Score concurrently
      setPipeline((prev) => ({
        ...prev,
        currentStep: "步驟 3/4：正在合成角色對白語音與 Lyria 原創配樂...",
      }));

      const useBrowserSpeech =
        enginePrefs.speechProvider === "local" &&
        enginePrefs.local.ttsProvider === "browser_speech";

      const audioPromises = newScenes.map(async (scene) => {
        if (useBrowserSpeech) {
          updateScene(projectId, scene.id, (sc) => ({
            ...sc,
            status: { ...sc.status, audio: "idle" },
          }));
          completed += 1;
          setPipeline((prev) => ({ ...prev, completedCount: completed }));
          return;
        }
        try {
          const { audioUrl } = await generateSpeechApi(
            {
              text: scene.dialogueLine,
              voiceName: scene.voiceName,
              voiceStyle: scene.voiceStyle,
              expressive: true,
            },
            enginePrefs
          );
          updateScene(projectId, scene.id, (sc) => ({
            ...sc,
            audioUrl,
            status: { ...sc.status, audio: "ready" },
          }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : "語音生成失敗";
          updateScene(projectId, scene.id, (sc) => ({
            ...sc,
            status: { ...sc.status, audio: "error", errorMessage: msg },
          }));
        } finally {
          completed += 1;
          setPipeline((prev) => ({ ...prev, completedCount: completed }));
        }
      });

      const musicPromise = (async () => {
        try {
          const { audioUrl } = await generateMusicApi(
            {
              prompt: newProject.musicPrompt,
              referenceImageDataUrl: anchorImageUrl,
            },
            enginePrefs
          );
          updateProject(projectId, (p) => ({
            ...p,
            musicUrl: audioUrl,
            musicStatus: "ready",
          }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : "配樂生成失敗";
          updateProject(projectId, (p) => ({
            ...p,
            musicStatus: "error",
            musicError: msg,
          }));
        } finally {
          completed += 1;
          setPipeline((prev) => ({ ...prev, completedCount: completed }));
        }
      })();

      await Promise.all([...audioPromises, musicPromise]);

      // Step 4 (Optional): Omni 1.2 Flash Video Generation
      if (brief.autoGenerateVideo) {
        setPipeline((prev) => ({
          ...prev,
          currentStep: "步驟 4/4：正在使用 Gemini Omni 1.2 將分鏡影格轉製為動態影片...",
        }));

        // Read latest project scenes to get their imageUrls
        for (const scene of newScenes) {
          let latestImage: string | undefined = anchorImageUrl;
          setProjects((currentList) => {
            const p = currentList.find((item) => item.id === projectId);
            const s = p?.scenes.find((item) => item.id === scene.id);
            latestImage = s?.imageUrl;
            return currentList;
          });

          try {
            const { videoUrl } = await generateVideoApi(
              {
                prompt: scene.videoMotionPrompt || scene.visualPrompt,
                imageDataUrl: latestImage,
                aspectRatio: brief.aspectRatio,
                durationSec: scene.durationSec,
              },
              enginePrefs
            );
            updateScene(projectId, scene.id, (sc) => ({
              ...sc,
              videoUrl,
              status: { ...sc.status, video: "ready" },
            }));
          } catch (err) {
            const msg = err instanceof Error ? err.message : "動態影片生成失敗";
            updateScene(projectId, scene.id, (sc) => ({
              ...sc,
              status: { ...sc.status, video: "error", errorMessage: msg },
            }));
          } finally {
            completed += 1;
            setPipeline((prev) => ({ ...prev, completedCount: completed }));
          }
        }
      }

      setPipeline({
        active: false,
        currentStep: "短劇自動化製片完成，可立即於放映廳播放或匯出成片。",
        completedCount: totalTasks,
        totalCount: totalTasks,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "自動製片管線發生錯誤";
      setBannerError(msg);
      setPipeline({
        active: false,
        currentStep: "",
        completedCount: completed,
        totalCount: totalTasks,
        error: msg,
      });
    }
  };

  const handleAddScene = () => {
    const nextNum = activeProject.scenes.length + 1;
    const newScene: DramaScene = {
      id: `${activeProject.id}-sc-${Date.now()}`,
      sceneNumber: nextNum,
      title: `第 ${nextNum} 場 · 新增鏡頭`,
      shotType: "中景緩推 · 35mm",
      durationSec: 6,
      motionEffect: "zoom",
      visualPrompt:
        activeProject.scenes[activeProject.scenes.length - 1]?.visualPrompt ??
        "Cinematic 35mm film still, atmospheric lighting, no text",
      videoMotionPrompt: "Slow cinematic camera push-in, subtle atmospheric motion",
      speaker: activeProject.characters[0]?.name ?? "旁白",
      voiceName: activeProject.characters[0]?.voiceName ?? "Charon",
      voiceStyle: activeProject.characters[0]?.voiceStyle ?? "Calm film narration",
      dialogueLine: "夜色漸深，所有的線索都在這一刻重新拼湊起來。",
      sfxCue: "環境微風與低沉城市背景音",
      status: { image: "idle", video: "idle", audio: "idle" },
    };

    updateProject(activeProject.id, (proj) => ({
      ...proj,
      scenes: [...proj.scenes, newScene],
    }));
    setSelectedSceneId(newScene.id);
  };

  const handleDeleteScene = (sceneId: string) => {
    if (activeProject.scenes.length <= 1) return;
    const filtered = activeProject.scenes
      .filter((s) => s.id !== sceneId)
      .map((s, idx) => ({ ...s, sceneNumber: idx + 1 }));

    updateProject(activeProject.id, (proj) => ({
      ...proj,
      scenes: filtered,
    }));
    if (selectedSceneId === sceneId && filtered[0]) {
      setSelectedSceneId(filtered[0].id);
    }
  };

  const handlePreviewScene = (sceneId: string) => {
    let offset = 0;
    for (const sc of activeProject.scenes) {
      if (sc.id === sceneId) break;
      offset += sc.durationSec;
    }
    setSelectedSceneId(sceneId);
    setCurrentTime(offset);
    setActiveTab("screening");
    setIsPlaying(true);
  };

  const handleExportWebM = async () => {
    if (isExportingWebM) return;
    setIsPlaying(false);
    setIsExportingWebM(true);
    setBannerError(null);
    setExportProgressLabel("準備渲染成片...");
    try {
      await renderAndDownloadWebM(activeProject, (_pct, label) => {
        setExportProgressLabel(label);
      });
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : "成片渲染匯出失敗");
    } finally {
      setIsExportingWebM(false);
      setExportProgressLabel("");
    }
  };

  const handleUpgradeAllVideos = async () => {
    const targets = activeProject.scenes.filter((s) => !s.videoUrl);
    if (targets.length === 0) return;

    setBannerError(null);
    let done = 0;
    setPipeline({
      active: true,
      currentStep: "正在將全片分鏡升級為 Gemini Omni 1.2 動態影片...",
      completedCount: 0,
      totalCount: targets.length,
    });

    for (const scene of targets) {
      await handleGenerateVideo(scene.id);
      done += 1;
      setPipeline((prev) => ({ ...prev, completedCount: done }));
    }

    setPipeline({
      active: false,
      currentStep: "全片動態影像化完成",
      completedCount: targets.length,
      totalCount: targets.length,
    });
  };

  const stats = useMemo(() => {
    const totalSec = activeProject.scenes.reduce((sum, s) => sum + s.durationSec, 0);
    const readyImages = activeProject.scenes.filter((s) => Boolean(s.imageUrl)).length;
    const readyVideos = activeProject.scenes.filter((s) => Boolean(s.videoUrl)).length;
    const readyAudio = activeProject.scenes.filter((s) => Boolean(s.audioUrl)).length;
    return { totalSec, readyImages, readyVideos, readyAudio };
  }, [activeProject]);

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="border-b border-zinc-800/90 bg-[#09090B]/95 backdrop-blur sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab("screening");
            }}
            className="font-display text-lg font-bold tracking-tight text-zinc-100 whitespace-nowrap shrink-0"
          >
            CineForge Studio
          </a>

          {/* Zone 2: Clean Single-line Nav Links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
            {(
              [
                { id: "screening", label: "成片放映廳" },
                { id: "storyboard", label: "分鏡導演室" },
                { id: "timeline", label: "多軌時間軸" },
                { id: "script", label: "導演手記" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === tab.id
                    ? "border-amber-500 text-zinc-100"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 Primary CTA */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-zinc-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Clapperboard className="w-3.5 h-3.5" />
              <span>新增短劇企劃</span>
            </button>
          </div>
        </div>

        {/* Mobile Nav Row (keeps top bar clean on desktop, usable on narrow screens) */}
        <div className="md:hidden border-t border-zinc-800/80 px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs">
          {(
            [
              { id: "screening", label: "成片放映廳" },
              { id: "storyboard", label: "分鏡導演室" },
              { id: "timeline", label: "多軌時間軸" },
              { id: "script", label: "導演手記" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`py-1 whitespace-nowrap shrink-0 ${
                activeTab === tab.id ? "text-amber-400 font-medium" : "text-zinc-400"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6 space-y-6">
        {/* Workspace Project Switcher & Production Summary Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="project-select" className="text-xs text-zinc-500">
              目前專案
            </label>
            <select
              id="project-select"
              value={activeProject.id}
              onChange={(e) => {
                const next = projects.find((p) => p.id === e.target.value);
                if (next) {
                  setIsPlaying(false);
                  setCurrentTime(0);
                  setActiveProjectId(next.id);
                  setSelectedSceneId(next.scenes[0]?.id ?? "");
                }
              }}
              className="rounded-lg bg-[#111114] border border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-100 focus:outline-none focus:border-amber-500"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>

            <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400 font-mono tabular-nums">
              <span>{stats.totalSec}s</span>
              <span aria-hidden="true">·</span>
              <span>
                影格 {stats.readyImages}/{activeProject.scenes.length}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                動態 {stats.readyVideos}/{activeProject.scenes.length}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                配音 {stats.readyAudio}/{activeProject.scenes.length}
              </span>
              <span aria-hidden="true">·</span>
              <span>{activeProject.musicUrl ? "配樂就緒" : "待配樂"}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEngineModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#111114] border border-zinc-800 text-zinc-300 hover:text-amber-400 hover:border-zinc-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              <span>
                引擎：
                {[
                  enginePrefs.scriptProvider,
                  enginePrefs.imageProvider,
                  enginePrefs.videoProvider,
                  enginePrefs.speechProvider,
                  enginePrefs.musicProvider,
                ].every((p) => p === "local")
                  ? "全本地模型"
                  : [
                      enginePrefs.scriptProvider,
                      enginePrefs.imageProvider,
                      enginePrefs.videoProvider,
                      enginePrefs.speechProvider,
                      enginePrefs.musicProvider,
                    ].some((p) => p === "local")
                  ? "Gemini + 本地混合"
                  : "Gemini 雲端"}
              </span>
            </button>

            {stats.readyVideos < activeProject.scenes.length && (
              <button
                type="button"
                onClick={handleUpgradeAllVideos}
                disabled={pipeline.active}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#111114] border border-zinc-800 text-zinc-300 hover:text-amber-400 hover:border-zinc-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Video className="w-3.5 h-3.5" />
                <span>全片轉動態影片</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Pipeline Progress or Error Notice */}
        {(pipeline.active || pipeline.currentStep || bannerError) && (
          <div
            className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-4 text-xs ${
              bannerError
                ? "bg-rose-950/30 border-rose-900/60 text-rose-200"
                : "bg-[#111114] border-zinc-800 text-zinc-200"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              {bannerError ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : pipeline.active ? (
                <Loader2 className="w-4 h-4 animate-spin text-amber-400 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span className="truncate">{bannerError || pipeline.currentStep}</span>
              {pipeline.active && pipeline.totalCount > 0 && (
                <span className="font-mono tabular-nums text-amber-400 shrink-0">
                  {pipeline.completedCount} / {pipeline.totalCount}
                </span>
              )}
            </div>

            {!pipeline.active && (
              <button
                type="button"
                onClick={() => {
                  setBannerError(null);
                  setPipeline((prev) => ({ ...prev, currentStep: "", error: undefined }));
                }}
                aria-label="關閉訊息"
                className="p-1 text-zinc-400 hover:text-zinc-100 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Active View */}
        {activeTab === "screening" && (
          <div className="space-y-8">
            <ScreeningPlayer
              project={activeProject}
              currentTime={currentTime}
              isPlaying={isPlaying}
              allowBrowserSpeech={
                enginePrefs.speechProvider === "local" &&
                enginePrefs.local.ttsProvider === "browser_speech"
              }
              onTimeChange={setCurrentTime}
              onPlayToggle={setIsPlaying}
              onSelectScene={setSelectedSceneId}
              onGenerateMissingAudio={handleGenerateMissingAudio}
              onExportBible={() => exportProductionBible(activeProject)}
              onExportWebM={handleExportWebM}
              isExportingWebM={isExportingWebM}
              exportProgressLabel={exportProgressLabel}
              isPipelineRunning={pipeline.active}
            />

            {/* Production Overview & Cast Strip */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2 border-t border-zinc-800/80">
              <div className="lg:col-span-5 space-y-2">
                <h2 className="text-sm font-semibold text-zinc-200">導演視覺手記</h2>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {activeProject.logline}
                </p>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  {activeProject.directorVision}
                </p>
              </div>

              <div className="lg:col-span-7 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-zinc-200">角色聲線配置</h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab("storyboard")}
                    className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>進入分鏡導演室細修</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {activeProject.characters.map((char) => (
                    <div
                      key={char.name}
                      className="bg-[#111114] border border-zinc-800 rounded-xl p-4 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-zinc-100 text-sm">
                          {char.name}
                        </span>
                        <span className="font-mono text-amber-400">{char.voiceName}</span>
                      </div>
                      <p className="text-xs text-zinc-400">{char.role}</p>
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        {char.voiceStyle}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === "storyboard" && (
          <StoryboardBoard
            scenes={activeProject.scenes}
            aspectRatio={activeProject.aspectRatio}
            selectedSceneId={selectedSceneId}
            onSelectScene={setSelectedSceneId}
            onUpdateScene={(sceneId, patch) =>
              updateScene(activeProject.id, sceneId, (sc) => ({ ...sc, ...patch }))
            }
            onRegenerateImage={handleRegenerateImage}
            onGenerateVideo={handleGenerateVideo}
            onRegenerateSpeech={handleRegenerateSpeech}
            onPreviewScene={handlePreviewScene}
            onAddScene={handleAddScene}
            onDeleteScene={handleDeleteScene}
          />
        )}

        {activeTab === "timeline" && (
          <TimelineEditor
            project={activeProject}
            currentTime={currentTime}
            isPlaying={isPlaying}
            selectedSceneId={selectedSceneId}
            onTimeChange={setCurrentTime}
            onPlayToggle={setIsPlaying}
            onSelectScene={setSelectedSceneId}
            onUpdateMusicPrompt={(prompt) =>
              updateProject(activeProject.id, (p) => ({ ...p, musicPrompt: prompt }))
            }
            onRegenerateMusic={() => handleRegenerateMusic()}
            onRegenerateSpeech={handleRegenerateSpeech}
            onGenerateVideo={handleGenerateVideo}
          />
        )}

        {activeTab === "script" && (
          <section className="bg-[#111114] border border-zinc-800 rounded-xl p-6 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-zinc-800">
              <div className="space-y-1.5 max-w-2xl">
                <p className="text-xs text-amber-400 font-medium">
                  {activeProject.genre} · {activeProject.visualStyle}
                </p>
                <h2 className="text-2xl font-bold text-zinc-100 tracking-tight">
                  {activeProject.title}
                </h2>
                <p className="text-sm text-zinc-300 leading-relaxed">{activeProject.logline}</p>
                <p className="text-xs text-zinc-500 leading-relaxed pt-1">
                  攝影與調色方向：{activeProject.directorVision}
                </p>
              </div>
              <button
                type="button"
                onClick={() => exportProductionBible(activeProject)}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer"
              >
                下載分鏡劇本 (.md)
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="py-3 pr-4 font-medium w-24">時間碼</th>
                    <th className="py-3 pr-4 font-medium w-44">場次與鏡位</th>
                    <th className="py-3 pr-4 font-medium">對白 / 旁白與音效</th>
                    <th className="py-3 font-medium w-40 text-right">製片操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {(() => {
                    let acc = 0;
                    return activeProject.scenes.map((scene) => {
                      const start = acc;
                      acc += scene.durationSec;
                      return (
                        <tr key={scene.id} className="hover:bg-zinc-900/40 transition-colors">
                          <td className="py-3.5 pr-4 font-mono tabular-nums text-zinc-400 align-top whitespace-nowrap">
                            {formatTimecode(start)} – {formatTimecode(acc)}
                          </td>
                          <td className="py-3.5 pr-4 align-top">
                            <p className="font-medium text-zinc-100">{scene.title}</p>
                            <p className="text-zinc-500 mt-0.5">{scene.shotType}</p>
                          </td>
                          <td className="py-3.5 pr-4 align-top space-y-1">
                            <p className="text-zinc-200 leading-relaxed">
                              <span className="text-amber-400 font-medium">{scene.speaker}：</span>
                              {scene.dialogueLine}
                            </p>
                            <p className="text-zinc-500">環境音效：{scene.sfxCue}</p>
                          </td>
                          <td className="py-3.5 align-top text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handlePreviewScene(scene.id)}
                              className="text-amber-400 hover:text-amber-300 font-medium cursor-pointer"
                            >
                              從此場放映
                            </button>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      <CreationStudioModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreateAutomatedDrama}
        isSubmitting={pipeline.active}
      />

      <LocalModelModal
        open={isEngineModalOpen}
        preferences={enginePrefs}
        onSave={(next) => {
          setEnginePrefs(next);
          saveEnginePreferences(next);
        }}
        onClose={() => setIsEngineModalOpen(false)}
      />
    </div>
  );
}
