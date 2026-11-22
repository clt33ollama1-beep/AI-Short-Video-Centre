import type { DramaProject } from "../types/director";

export function formatTimecode(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
}

export function exportProductionBible(project: DramaProject) {
  const totalSec = project.scenes.reduce((acc, s) => acc + s.durationSec, 0);
  const lines: string[] = [
    `# ${project.title}`,
    "",
    `- 題材：${project.genre}`,
    `- 視覺風格：${project.visualStyle}`,
    `- 畫面比例：${project.aspectRatio}`,
    `- 總片長：${totalSec} 秒（共 ${project.scenes.length} 場）`,
    "",
    `## 故事梗概`,
    project.logline,
    "",
    `## 導演視覺筆記`,
    project.directorVision,
    "",
    `## 原創配樂提示詞（Lyria）`,
    project.musicPrompt,
    "",
    `## 角色與聲線設定`,
    ...project.characters.map(
      (c) => `- **${c.name}**（${c.role}）｜聲線：${c.voiceName}｜語氣：${c.voiceStyle}｜造型錨點：${c.appearanceAnchor}`
    ),
    "",
    `## 分場分鏡表`,
  ];

  let elapsed = 0;
  for (const scene of project.scenes) {
    const start = formatTimecode(elapsed);
    const end = formatTimecode(elapsed + scene.durationSec);
    elapsed += scene.durationSec;

    lines.push(
      `### 第 ${String(scene.sceneNumber).padStart(2, "0")} 場：${scene.title}（${start} – ${end}）`,
      `- **鏡頭語言**：${scene.shotType}（${scene.durationSec}s · ${scene.motionEffect}）`,
      `- **說話角色**：${scene.speaker}（${scene.voiceName} / ${scene.voiceStyle}）`,
      `- **對白台詞**：「${scene.dialogueLine}」`,
      `- **環境音效**：${scene.sfxCue}`,
      `- **影像提示詞**：\`${scene.visualPrompt}\``,
      `- **動態運鏡提示詞**：\`${scene.videoMotionPrompt}\``,
      ""
    );
  }

  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.title.replace(/\s+/g, "_")}_分鏡劇本手冊.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("無法載入分鏡影像進行成片渲染"));
    img.src = src;
  });
}

function loadVideoElement(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.onloadeddata = () => resolve(video);
    video.onerror = () => reject(new Error("無法載入動態影片片段"));
    video.src = src;
  });
}

function wrapSubtitleLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const chars = Array.from(text);
  const lines: string[] = [];
  let current = "";
  for (const ch of chars) {
    const test = current + ch;
    if (ctx.measureText(test).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function renderAndDownloadWebM(
  project: DramaProject,
  onProgress?: (pct: number, label: string) => void
): Promise<void> {
  const isVertical = project.aspectRatio === "9:16";
  const width = isVertical ? 720 : 1280;
  const height = isVertical ? 1280 : 720;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("無法初始化影像合成畫布");

  onProgress?.(5, "載入分鏡視覺與音軌資產...");

  // Preload media per scene
  const sceneVisuals = await Promise.all(
    project.scenes.map(async (scene) => {
      if (scene.videoUrl) {
        try {
          const vid = await loadVideoElement(scene.videoUrl);
          return { type: "video" as const, vid, img: null };
        } catch {
          // Fallback to still image if video fails
        }
      }
      if (scene.imageUrl) {
        const img = await loadImageElement(scene.imageUrl);
        return { type: "image" as const, vid: null, img };
      }
      return { type: "none" as const, vid: null, img: null };
    })
  );

  // Audio mixing setup
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();

  // Decode Lyria BGM if available
  let bgmSource: AudioBufferSourceNode | null = null;
  let bgmGain: GainNode | null = null;
  if (project.musicUrl) {
    try {
      const resp = await fetch(project.musicUrl);
      const arr = await resp.arrayBuffer();
      const decoded = await audioCtx.decodeAudioData(arr);
      bgmSource = audioCtx.createBufferSource();
      bgmSource.buffer = decoded;
      bgmSource.loop = true;
      bgmGain = audioCtx.createGain();
      bgmGain.gain.value = 0.28;
      bgmSource.connect(bgmGain);
      bgmGain.connect(dest);
    } catch {
      // Ignore BGM decode error and continue
    }
  }

  // Decode speech clips per scene
  const speechBuffers: Array<AudioBuffer | null> = await Promise.all(
    project.scenes.map(async (scene) => {
      if (!scene.audioUrl) return null;
      try {
        const resp = await fetch(scene.audioUrl);
        const arr = await resp.arrayBuffer();
        return await audioCtx.decodeAudioData(arr);
      } catch {
        return null;
      }
    })
  );

  const canvasStream = canvas.captureStream(30);
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : "video/webm";

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 4_000_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const totalDurationSec = project.scenes.reduce((sum, s) => sum + s.durationSec, 0);
  const recordingDone = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start(250);
  if (bgmSource) bgmSource.start(audioCtx.currentTime);

  // Schedule all voiceovers along the timeline
  let cursor = 0;
  for (let i = 0; i < project.scenes.length; i++) {
    const buf = speechBuffers[i];
    if (buf) {
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      const gain = audioCtx.createGain();
      gain.gain.value = 1.0;
      src.connect(gain);
      gain.connect(dest);
      src.start(audioCtx.currentTime + cursor + 0.2);
    }
    cursor += project.scenes[i].durationSec;
  }

  // Render frame loop in real time
  const startMs = performance.now();
  let lastSceneIdx = -1;

  await new Promise<void>((resolve) => {
    const step = () => {
      const elapsedSec = (performance.now() - startMs) / 1000;
      if (elapsedSec >= totalDurationSec) {
        resolve();
        return;
      }

      let acc = 0;
      let sceneIdx = 0;
      let sceneLocalSec = 0;
      for (let i = 0; i < project.scenes.length; i++) {
        const dur = project.scenes[i].durationSec;
        if (elapsedSec < acc + dur || i === project.scenes.length - 1) {
          sceneIdx = i;
          sceneLocalSec = elapsedSec - acc;
          break;
        }
        acc += dur;
      }

      if (sceneIdx !== lastSceneIdx) {
        if (lastSceneIdx >= 0 && sceneVisuals[lastSceneIdx].type === "video") {
          sceneVisuals[lastSceneIdx].vid?.pause();
        }
        if (sceneVisuals[sceneIdx].type === "video") {
          const v = sceneVisuals[sceneIdx].vid;
          if (v) {
            v.currentTime = 0;
            void v.play();
          }
        }
        lastSceneIdx = sceneIdx;
      }

      const scene = project.scenes[sceneIdx];
      const visual = sceneVisuals[sceneIdx];
      const progressInScene = Math.min(1, Math.max(0, sceneLocalSec / scene.durationSec));

      // Background clear
      ctx.fillStyle = "#09090B";
      ctx.fillRect(0, 0, width, height);

      const drawMediaCover = (media: HTMLImageElement | HTMLVideoElement, mw: number, mh: number) => {
        const scaleBase = Math.max(width / mw, height / mh);
        let motionScale = 1;
        let offsetX = 0;
        let offsetY = 0;

        if (visual.type === "image") {
          if (scene.motionEffect === "zoom") {
            motionScale = 1 + 0.08 * progressInScene;
          } else if (scene.motionEffect === "pull") {
            motionScale = 1.08 - 0.08 * progressInScene;
          } else {
            motionScale = 1.06;
            offsetX = (-0.02 + 0.04 * progressInScene) * width;
          }
        }

        const finalScale = scaleBase * motionScale;
        const dw = mw * finalScale;
        const dh = mh * finalScale;
        const dx = (width - dw) / 2 + offsetX;
        const dy = (height - dh) / 2 + offsetY;
        ctx.drawImage(media, dx, dy, dw, dh);
      };

      if (visual.type === "video" && visual.vid) {
        drawMediaCover(visual.vid, visual.vid.videoWidth || width, visual.vid.videoHeight || height);
      } else if (visual.type === "image" && visual.img) {
        drawMediaCover(visual.img, visual.img.naturalWidth || width, visual.img.naturalHeight || height);
      }

      // Bottom scrim for legibility
      const grad = ctx.createLinearGradient(0, height * 0.65, 0, height);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.85)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, height * 0.65, width, height * 0.35);

      // Subtitle rendering
      if (scene.dialogueLine) {
        ctx.textAlign = "center";
        ctx.font = `600 ${isVertical ? 26 : 28}px "Plus Jakarta Sans", "PingFang TC", sans-serif`;
        const lines = wrapSubtitleLines(ctx, scene.dialogueLine, width * 0.82);
        const lineHeight = isVertical ? 36 : 38;
        const baseY = height - (isVertical ? 110 : 54) - (lines.length - 1) * lineHeight;

        ctx.font = `500 ${isVertical ? 18 : 16}px "Outfit", "PingFang TC", sans-serif`;
        ctx.fillStyle = "#F59E0B";
        ctx.fillText(scene.speaker, width / 2, baseY - 28);

        ctx.font = `600 ${isVertical ? 26 : 28}px "Plus Jakarta Sans", "PingFang TC", sans-serif`;
        ctx.fillStyle = "#FAFAFA";
        ctx.shadowColor = "rgba(0,0,0,0.9)";
        ctx.shadowBlur = 8;
        lines.forEach((line, idx) => {
          ctx.fillText(line, width / 2, baseY + idx * lineHeight);
        });
        ctx.shadowBlur = 0;
      }

      const pct = Math.min(98, Math.round(10 + (elapsedSec / totalDurationSec) * 88));
      onProgress?.(pct, `正在合成畫面與音軌 ${formatTimecode(elapsedSec)} / ${formatTimecode(totalDurationSec)}`);

      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  recorder.stop();
  await recordingDone;
  if (bgmSource) {
    try {
      bgmSource.stop();
    } catch {
      // ignore
    }
  }
  await audioCtx.close();

  const webmBlob = new Blob(chunks, { type: "video/webm" });
  const url = URL.createObjectURL(webmBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.title.replace(/\s+/g, "_")}.webm`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  onProgress?.(100, "成片匯出完成");
}
