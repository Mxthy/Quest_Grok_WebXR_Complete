/**
 * Save layer — localStorage primary, IndexedDB optional mirror.
 * Existing zustand persist continues to work; this is an explicit API.
 */
import { SAVE_KEY, SAVE_VERSION, type GameSave } from "@/game/types";
import { defaultSave } from "@/stores/gameStore";

const IDB_NAME = "vivi-apartment-saves";
const IDB_STORE = "saves";

function openIdb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onerror = () => resolve(null);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
    } catch {
      resolve(null);
    }
  });
}

export class SaveManager {
  async loadLocal(): Promise<GameSave | null> {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { state?: GameSave } & GameSave;
      // zustand persist wraps as { state, version }
      const state = (parsed as { state?: GameSave }).state ?? parsed;
      if (!state || typeof state !== "object") return null;
      return { ...defaultSave(), ...state, version: SAVE_VERSION };
    } catch {
      return null;
    }
  }

  async saveLocal(save: GameSave): Promise<boolean> {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ state: save, version: SAVE_VERSION }));
      // best-effort IDB mirror
      void this.mirrorIdb(save);
      return true;
    } catch {
      return false;
    }
  }

  private async mirrorIdb(save: GameSave): Promise<void> {
    const db = await openIdb();
    if (!db) return;
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(save, "primary");
    } catch {
      /* */
    }
  }

  async loadIdb(): Promise<GameSave | null> {
    const db = await openIdb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get("primary");
        req.onsuccess = () => resolve((req.result as GameSave) ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  /** optional cloud stub — no network dependency for Quest offline */
  async loadCloud(_userId: string): Promise<GameSave | null> {
    return null;
  }

  async saveCloud(_userId: string, _save: GameSave): Promise<boolean> {
    return false;
  }
}

export const saveManager = new SaveManager();
