import { SHOWCASE_PROJECT } from "../data/showcaseProject";
import type { DramaProject } from "../types/director";

const DB_NAME = "cineforge_studio_db";
const DB_VERSION = 1;
const STORE_NAME = "workspace";
const WORKSPACE_KEY = "projects_v1";
const ACTIVE_ID_LS_KEY = "cineforge_active_project_id_v1";

export interface PersistedWorkspace {
  projects: DramaProject[];
  activeProjectId: string;
  updatedAt: number;
}

function sanitizeProjects(projects: DramaProject[]): DramaProject[] {
  return projects.map((proj) => ({
    ...proj,
    musicStatus:
      proj.musicStatus === "generating"
        ? proj.musicUrl
          ? "ready"
          : "idle"
        : proj.musicStatus,
    scenes: (proj.scenes ?? []).map((sc) => ({
      ...sc,
      status: {
        image:
          sc.status?.image === "generating"
            ? sc.imageUrl
              ? "ready"
              : "idle"
            : sc.status?.image || (sc.imageUrl ? "ready" : "idle"),
        video:
          sc.status?.video === "generating"
            ? sc.videoUrl
              ? "ready"
              : "idle"
            : sc.status?.video || (sc.videoUrl ? "ready" : "idle"),
        audio:
          sc.status?.audio === "generating"
            ? sc.audioUrl
              ? "ready"
              : "idle"
            : sc.status?.audio || (sc.audioUrl ? "ready" : "idle"),
        errorMessage: sc.status?.errorMessage,
      },
    })),
  }));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Failed to open IndexedDB"));
  });
}

async function readFromIdb(): Promise<PersistedWorkspace | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(WORKSPACE_KEY);
      req.onsuccess = () => resolve((req.result as PersistedWorkspace) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function writeToIdb(payload: PersistedWorkspace): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(payload, WORKSPACE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore storage quota errors
  }
}

async function readFromServer(): Promise<PersistedWorkspace | null> {
  try {
    const res = await fetch("/api/projects");
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<PersistedWorkspace>;
    if (!Array.isArray(data.projects)) return null;
    return {
      projects: data.projects,
      activeProjectId: typeof data.activeProjectId === "string" ? data.activeProjectId : "",
      updatedAt: Number(data.updatedAt) || 0,
    };
  } catch {
    return null;
  }
}

async function writeToServer(payload: PersistedWorkspace): Promise<void> {
  try {
    await fetch("/api/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // ignore offline/transient server sync errors; IndexedDB retains data
  }
}

function scoreProjectCompleteness(p: DramaProject): number {
  let score = p.scenes.length;
  for (const s of p.scenes) {
    if (s.imageUrl) score += 10;
    if (s.videoUrl) score += 10;
    if (s.audioUrl) score += 10;
  }
  if (p.musicUrl) score += 10;
  return score;
}

function mergeProjects(
  primary: DramaProject[],
  secondary: DramaProject[]
): DramaProject[] {
  const byId = new Map<string, DramaProject>();
  for (const proj of [...secondary, ...primary]) {
    if (!proj?.id) continue;
    const existing = byId.get(proj.id);
    if (!existing || scoreProjectCompleteness(proj) >= scoreProjectCompleteness(existing)) {
      byId.set(proj.id, proj);
    }
  }
  if (!byId.has(SHOWCASE_PROJECT.id)) {
    byId.set(SHOWCASE_PROJECT.id, SHOWCASE_PROJECT);
  }
  const list = Array.from(byId.values());
  // Keep user-created projects first (sorted newest createdAt first), showcase at end if others exist
  list.sort((a, b) => {
    if (a.id === SHOWCASE_PROJECT.id) return 1;
    if (b.id === SHOWCASE_PROJECT.id) return -1;
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });
  return sanitizeProjects(list);
}

export async function loadPersistedWorkspace(): Promise<PersistedWorkspace> {
  const [idb, server] = await Promise.all([readFromIdb(), readFromServer()]);

  const idbProjects = Array.isArray(idb?.projects) ? idb.projects : [];
  const serverProjects = Array.isArray(server?.projects) ? server.projects : [];

  const newerIsServer = (server?.updatedAt ?? 0) > (idb?.updatedAt ?? 0);
  const merged = newerIsServer
    ? mergeProjects(serverProjects, idbProjects)
    : mergeProjects(idbProjects, serverProjects);

  let savedActiveId = "";
  try {
    savedActiveId = localStorage.getItem(ACTIVE_ID_LS_KEY) || "";
  } catch {
    savedActiveId = "";
  }

  const candidateActive =
    (newerIsServer ? server?.activeProjectId : idb?.activeProjectId) ||
    savedActiveId ||
    merged[0]?.id ||
    SHOWCASE_PROJECT.id;

  const activeProjectId = merged.some((p) => p.id === candidateActive)
    ? candidateActive
    : merged[0]?.id || SHOWCASE_PROJECT.id;

  return {
    projects: merged,
    activeProjectId,
    updatedAt: Math.max(idb?.updatedAt ?? 0, server?.updatedAt ?? 0),
  };
}

export async function savePersistedWorkspace(
  projects: DramaProject[],
  activeProjectId: string
): Promise<void> {
  const payload: PersistedWorkspace = {
    projects: sanitizeProjects(projects),
    activeProjectId,
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(ACTIVE_ID_LS_KEY, activeProjectId);
  } catch {
    // ignore
  }
  await Promise.all([writeToIdb(payload), writeToServer(payload)]);
}

export function exportProjectJson(project: DramaProject): void {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.title || "cineforge_project"}.cineforge.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseImportedProjectJson(rawText: string): DramaProject {
  const parsed = JSON.parse(rawText) as Partial<DramaProject>;
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.scenes)) {
    throw new Error("無效的 CineForge 專案 JSON 檔案");
  }
  const normalized: DramaProject = {
    id: parsed.id || `proj-${Date.now()}`,
    title: parsed.title || "匯入的短劇專案",
    premise: parsed.premise || "",
    genre: parsed.genre || "都市懸疑",
    visualStyle: parsed.visualStyle || "35mm 膠片寫實暗調",
    aspectRatio: parsed.aspectRatio === "9:16" ? "9:16" : "16:9",
    logline: parsed.logline || "",
    directorVision: parsed.directorVision || "",
    musicPrompt: parsed.musicPrompt || "",
    musicUrl: parsed.musicUrl,
    musicStatus: parsed.musicUrl ? "ready" : "idle",
    characters: Array.isArray(parsed.characters) ? parsed.characters : [],
    scenes: parsed.scenes,
    createdAt: parsed.createdAt || new Date().toISOString(),
  };
  return sanitizeProjects([normalized])[0];
}
