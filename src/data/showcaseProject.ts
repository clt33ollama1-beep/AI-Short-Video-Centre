import type { DramaProject, ProductionBrief, VoiceName } from "../types/director";

export const VOICE_OPTIONS: Array<{ id: VoiceName; label: string; characterHint: string }> = [
  { id: "Charon", label: "Charon · 深沉敘事男聲", characterHint: "適合冷靜旁白、懸疑偵探或沉穩主角" },
  { id: "Kore", label: "Kore · 清亮戲劇女聲", characterHint: "適合情感張力女主角、現代都會對白" },
  { id: "Puck", label: "Puck · 溫潤青年男聲", characterHint: "適合熱血男主、自然生活化對話" },
  { id: "Zephyr", label: "Zephyr · 柔美詩意女聲", characterHint: "適合文藝獨白、回憶片段與療癒敘事" },
  { id: "Fenrir", label: "Fenrir · 戲劇張力男聲", characterHint: "適合高衝突對手戲、反派或緊張轉折" },
];

export const GENRE_OPTIONS = [
  "都市懸疑微電影",
  "跨時空浪漫短劇",
  "近未來科幻寓言",
  "深夜治癒系小品",
  "東方新派武俠",
  "商業品牌劇情短片",
];

export const VISUAL_STYLE_OPTIONS = [
  {
    id: "35mm 膠片寫實暗調",
    promptHint: "35mm anamorphic cinema film still, warm tungsten highlights and deep rain-slicked slate shadows, subtle organic grain",
  },
  {
    id: "莫蘭迪柔光文藝",
    promptHint: "Soft diffused window lighting, muted Morandi color palette, poetic East Asian arthouse cinema framing, Leica 50mm f/1.4",
  },
  {
    id: "高對比黑白電影",
    promptHint: "High-contrast monochrome film noir cinematography, dramatic chiaroscuro shadows, silver halide grain texture",
  },
  {
    id: "新東方奇幻寫意",
    promptHint: "Atmospheric mist, silk lantern glow, ink-wash depth with hyper-real textures, sweeping cinematic composition",
  },
  {
    id: "賽博雨夜都會",
    promptHint: "Atmospheric nocturnal metropolis, glass reflections, subtle amber and teal sodium lighting, shallow depth of field",
  },
];

export const STORY_PRESETS: Array<{ label: string; brief: Partial<ProductionBrief> }> = [
  {
    label: "暴雨夜的記憶懷錶",
    brief: {
      premise: "失聰的古董鐘錶匠在暴雨夜收到一只會倒轉十秒的懷錶，每一次撥動指針，都能聽見十年前未說出口的那句告別。",
      genre: "跨時空浪漫短劇",
      visualStyle: "35mm 膠片寫實暗調",
      aspectRatio: "16:9",
      sceneCount: 4,
      dialogueMode: "dialogue",
    },
  },
  {
    label: "凌晨三點的最後一班電梯",
    brief: {
      premise: "加班到凌晨三點的建築師走進老舊大樓電梯，發現樓層按鈕多了一個從未見過的「B4 檔案室」，門開後遇見五年前失蹤的合夥人。",
      genre: "都市懸疑微電影",
      visualStyle: "高對比黑白電影",
      aspectRatio: "16:9",
      sceneCount: 4,
      dialogueMode: "dialogue",
    },
  },
  {
    label: "軌道上的無聲回信（直屏）",
    brief: {
      premise: "在火星殖民站擔任通訊員的女孩，每天對著延遲 14 分鐘的地球頻道朗讀日記，直到某天收到一段只剩呼吸與鋼琴聲的未知回訊。",
      genre: "近未來科幻寓言",
      visualStyle: "莫蘭迪柔光文藝",
      aspectRatio: "9:16",
      sceneCount: 4,
      dialogueMode: "narration",
    },
  },
];

export const SHOWCASE_PROJECT: DramaProject = {
  id: "showcase-platform-7",
  title: "第七號月台的信號",
  premise: "末班車離站後的午夜月台，一段遺落在車廂裡的卡式錄音帶，揭開兩人相約五年的秘密暗號。",
  genre: "都市懸疑微電影",
  visualStyle: "35mm 膠片寫實暗調",
  aspectRatio: "16:9",
  logline: "一場午夜驟雨中，他在停駛的第七號月台拾回五年前失蹤的錄音機，卻在倒帶聲裡聽見有人正站在身後。",
  directorVision: "以 35mm 變形寬銀幕定調，暖色鈉燈與冷雨夜青灰形成低飽和對比；前兩場採長鏡頭凝視與微推進，第三場轉入雙人對峙張力，終場以破曉微光收束。",
  musicPrompt:
    "Minimalist nocturnal cinema score, warm solo cello and felt piano over subtle rain ambience, slow 68 BPM, melancholic yet hopeful, purely instrumental, no vocals.",
  musicStatus: "idle",
  characters: [
    {
      name: "陳默",
      role: "深夜聲音採集師",
      appearanceAnchor: "East Asian man in his early 30s wearing a dark charcoal wool trench coat and carrying a black umbrella",
      voiceName: "Charon",
      voiceStyle: "低沉克制、帶著雨夜孤寂感的電影旁白口吻",
    },
    {
      name: "林澄",
      role: "失約五年的錄音師",
      appearanceAnchor: "East Asian woman in a camel coat holding a dark umbrella under warm shopfront light",
      voiceName: "Kore",
      voiceStyle: "冷靜卻壓抑著激動情緒、語速緩慢清晰的對話口吻",
    },
  ],
  scenes: [
    {
      id: "scene-1",
      sceneNumber: 1,
      title: "第一場 · 午夜空月台",
      shotType: "遠景緩推 · 35mm 變形寬銀幕",
      durationSec: 6,
      motionEffect: "zoom",
      visualPrompt:
        "Cinematic 35mm film still of a rain-soaked elevated metropolitan train platform at midnight, warm tungsten sodium streetlights reflecting on wet stone tiles, a lone figure in a dark wool coat holding a black umbrella looking down the tracks.",
      videoMotionPrompt:
        "Slow cinematic push-in behind the figure holding a black umbrella on the rain-soaked train platform, rain falling steadily through warm tungsten lights, distant train headlights approaching softly.",
      speaker: "陳默",
      voiceName: "Charon",
      voiceStyle: "低沉克制、如同深夜獨白般緩慢有力",
      dialogueLine: "五年來每個下雨的週五，這班零點十二分的列車，從來沒有真正停下來過。",
      sfxCue: "雨滴敲打月台鐵皮雨棚與遠方鐵軌低頻震動",
      imageUrl: "/src/assets/images/showcase_scene_1_1795342245677.jpg",
      status: { image: "ready", video: "idle", audio: "idle" },
    },
    {
      id: "scene-2",
      sceneNumber: 2,
      title: "第二場 · 車廂裡的舊磁帶",
      shotType: "特寫橫移 · 50mm f/1.4",
      durationSec: 6,
      motionEffect: "pan",
      visualPrompt:
        "Cinematic close-up film still inside a quiet late-night commuter train car, rain droplets streaking down the dark window glass, warm amber interior light illuminating a vintage brushed-metal pocket tape recorder resting on a worn leather bench.",
      videoMotionPrompt:
        "Subtle handheld drift inside the dimly lit train car, raindrops sliding down the dark window glass while warm amber light flickers across the vintage cassette recorder.",
      speaker: "陳默",
      voiceName: "Charon",
      voiceStyle: "壓低嗓音、帶著驚訝與確認細節的口氣",
      dialogueLine: "直到今晚，空蕩的末班車座椅上，靜靜躺著當年我們約定好一起封存的磁帶。",
      sfxCue: "列車行駛節奏聲與卡式錄音機按下播放鍵的清脆聲響",
      imageUrl: "/src/assets/images/showcase_scene_2_1795342246319.jpg",
      status: { image: "ready", video: "idle", audio: "idle" },
    },
    {
      id: "scene-3",
      sceneNumber: 3,
      title: "第三場 · 巷口重逢",
      shotType: "雙人中遠景 · 35mm 靜止凝視",
      durationSec: 7,
      motionEffect: "pull",
      visualPrompt:
        "Dramatic cinematic medium-wide shot of a quiet nocturnal East Asian side street in light rain, soft steam rising from a street grate, warm amber shopfront light spilling across wet asphalt, two silhouettes standing ten paces apart in quiet tension.",
      videoMotionPrompt:
        "Slow pull-back shot in the misty rain-drenched side street, steam drifting gently upward from the pavement grate between the two standing figures holding black umbrellas.",
      speaker: "林澄",
      voiceName: "Kore",
      voiceStyle: "輕聲卻堅定、帶著五年等待後的釋然",
      dialogueLine: "你終於按下了播放鍵。我一直等在七號出口，只是不確定你還認不認得這段雜訊。",
      sfxCue: "街角蒸氣散逸聲與細雨落在柏油路面的沙沙聲",
      imageUrl: "/src/assets/images/showcase_scene_3_1795342245796.jpg",
      status: { image: "ready", video: "idle", audio: "idle" },
    },
    {
      id: "scene-4",
      sceneNumber: 4,
      title: "第四場 · 破曉天橋",
      shotType: "大遠景定格 · 24mm 廣角",
      durationSec: 6,
      motionEffect: "zoom",
      visualPrompt:
        "Poetic cinematic wide shot at first dawn from a quiet urban pedestrian overpass overlooking wet avenues and distant mist-covered buildings, cool silver-blue morning sky meeting fading warm amber streetlamps.",
      videoMotionPrompt:
        "Gentle slow camera glide forward along the wet pedestrian overpass at dawn, early morning traffic moving below as city mist slowly lifts over the skyline.",
      speaker: "陳默",
      voiceName: "Charon",
      voiceStyle: "平靜溫暖、釋懷收尾的電影尾聲語氣",
      dialogueLine: "原來真正的信號從來不在時間裡迷路，它只是等著雨停的那一刻。",
      sfxCue: "清晨微風與逐漸遠去的城市車流環境音",
      imageUrl: "/src/assets/images/showcase_scene_4_1795342246141.jpg",
      status: { image: "ready", video: "idle", audio: "idle" },
    },
  ],
  createdAt: "2026-11-22T02:10:00.000Z",
};
