import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  type InventoryItem,
  type PlacedItem,
  type Toast,
  type UiPanel,
  SAVE_KEY,
  SAVE_VERSION,
  levelFromAffection,
} from "@/game/types";
import { applyLevelUnlocks } from "@/systems/moodSystem";
import {
  DEFAULT_AGREEMENT,
  grantConsent,
  revokeConsent,
  openRegion,
  setPace,
  respectBoundary,
  ignoreBoundaryAttempt,
  markSharedMoment,
  type IntimacyAgreement,
  type IntimacyPace,
  type IntimacyRegion,
} from "@/systems/intimacyNegotiation";
import {
  rollPersona,
  learnFromBeat,
  autonomyTick,
  regionsSheAllows,
  dispositionLabel,
  type PersonaState,
} from "@/systems/viviPersona";
import {
  defaultCompanionState,
  syncCompanionFromGame,
  type CompanionState,
} from "@/companion/stateMachine";
import {
  loadStructuredMemory,
  purgeExpiredRaw,
  wipeAllMemory,
} from "@/companion/memory/structuredMemory";
import type { StructuredMemory } from "@/companion/types";
import { reactToInteraction } from "@/companion/reactions";


export type GameSave = {
  version: number;
  day: number;
  gameMinutes: number;
  affection: number;
  comfort: number;
  energy: number;
  coins: number;
  level: number;
  inventory: InventoryItem[];
  placedItems: PlacedItem[];
  photos: string[];
  unlockedDialogues: string[];
  outfit: string;
  unlockedOutfits: string[];
  unlockedDecor: string[];
  ingredients: Record<string, number>;
  cookingSlots: string[];
  tutorialDone: boolean;
  tutorialItemsGiven: boolean;
  interacted: string[];
  radioOn: boolean;
  lampOn: boolean;
  plantWateredDay: number;
  giftedCount: number;
  dishesCooked: number;
  alphaComplete: boolean;
  seenLevelUnlock: number;
};

export type GameState = GameSave & {
  playing: boolean;
  paused: boolean;
  photoMode: boolean;
  placeMode: boolean;
  placeItemId: string | null;
  hoverName: string;
  hoverDesc: string;
  useProgress: number;
  dialogueId: string | null;
  panel: UiPanel;
  toasts: Toast[];
  loading: boolean;
  loadProgress: number;
  loadError: string | null;
  lastLog: string;
  winShown: boolean;
  /** Consent gate for IV layer 1/2 zones (session only) */
  consent: boolean;
  /** Mutual intimacy agreement — regions, pace, trust (session) */
  intimacy: IntimacyAgreement;
  /** Session persona — random disposition + learned prefs */
  persona: PersonaState;
  /** Debug: show zone hit names in log / hover */
  showZones: boolean;
  llmPanelOpen: boolean;
  companion: CompanionState;
  structuredMemory: StructuredMemory;
  xrPresenting: boolean;
  llmPanelCtx: {
    scene?: string;
    seedNodeId?: string;
    zoneId?: string;
    zoneLayer?: number;
    gateReason?: string;
  };
};

const STARTER_INGREDIENTS: Record<string, number> = {
  egg: 4,
  rice: 3,
  ketchup: 2,
  milk: 3,
  cocoa: 2,
  marshmallow: 2,
  flour: 2,
};

export const defaultSave = (): GameSave => ({
  version: SAVE_VERSION,
  day: 1,
  gameMinutes: 10 * 60,
  affection: 0,
  comfort: 58,
  energy: 82,
  coins: 64,
  level: 0,
  inventory: [],
  placedItems: [],
  photos: [],
  unlockedDialogues: ["laptop_hello"],
  outfit: "cream",
  unlockedOutfits: ["cream"],
  unlockedDecor: [
    "floor_lamp",
    "potted_fern",
    "tea_candle",
    "floor_cushion",
    "ceramic_vase",
    "book_stack",
    "glass_jar",
  ],
  ingredients: { ...STARTER_INGREDIENTS },
  cookingSlots: [],
  tutorialDone: false,
  tutorialItemsGiven: false,
  interacted: [],
  radioOn: false,
  lampOn: true,
  plantWateredDay: 0,
  giftedCount: 0,
  dishesCooked: 0,
  alphaComplete: false,
  seenLevelUnlock: 0,
});

const defaultState = (): GameState => ({
  ...defaultSave(),
  playing: false,
  paused: false,
  photoMode: false,
  placeMode: false,
  placeItemId: null,
  hoverName: "",
  hoverDesc: "",
  useProgress: 0,
  dialogueId: null,
  panel: "none",
  toasts: [],
  loading: true,
  loadProgress: 0,
  loadError: null,
  lastLog: "",
  winShown: false,
  consent: false,
  intimacy: DEFAULT_AGREEMENT(),
  persona: rollPersona(),
  showZones: false,
  llmPanelOpen: false,
  companion: defaultCompanionState(),
  structuredMemory: loadStructuredMemory(),
  xrPresenting: false,
  llmPanelCtx: {},
});

let toastSeq = 1;

export const useGameStore = create<
  GameState & {
    start: () => void;
    setLoading: (v: boolean, p?: number, err?: string | null) => void;
    setHover: (name: string, desc: string) => void;
    setUseProgress: (v: number) => void;
    setPanel: (p: UiPanel) => void;
    setDialogue: (id: string | null) => void;
    toast: (text: string) => void;
    dismissToast: (id: number) => void;
    addStats: (d: { affection?: number; comfort?: number; energy?: number; coins?: number }) => void;
    markInteract: (id: string) => void;
    addItem: (id: string, kind: InventoryItem["kind"], qty?: number) => void;
    removeItem: (id: string, qty?: number) => boolean;
    placeDecor: (item: PlacedItem) => void;
    addPhoto: (dataUrl: string) => void;
    setOutfit: (id: string) => void;
    setCookingSlots: (slots: string[]) => void;
    takeIngredient: (id: string) => boolean;
    cookSuccess: (dishId: string, coins: number) => void;
    sleepToNextDay: () => void;
    tickDecay: (realDt: number, awake: boolean) => void;
    setGameMinutes: (m: number) => void;
    setRadio: (on: boolean) => void;
    setLamp: (on: boolean) => void;
    setPlaceMode: (on: boolean, itemId?: string | null) => void;
    setPhotoMode: (on: boolean) => void;
    setPlaying: (on: boolean) => void;
    setPaused: (on: boolean) => void;
    log: (msg: string) => void;
    grantTutorial: () => void;
    checkWin: () => boolean;
    resetSave: () => void;
    waterPlant: () => boolean;
    setConsent: (on: boolean) => void;
    setIntimacyPace: (pace: IntimacyPace) => void;
    openIntimacyRegion: (region: IntimacyRegion) => void;
    respectIntimacyBoundary: () => void;
    noteSharedIntimacy: () => void;
    resetIntimacyAgreement: () => void;
    rerollPersona: () => void;
    learnPersonaBeat: (
      region: IntimacyRegion,
      outcome: "good" | "mixed" | "bad",
      opts?: { playerRespectedStop?: boolean },
    ) => void;
    tickPersonaAutonomy: () => void;
    syncAgreementWithPersona: () => void;
    setShowZones: (on: boolean) => void;
    setXrPresenting: (on: boolean) => void;
    openLlmDialogue: (ctx?: GameState["llmPanelCtx"]) => void;
    closeLlmDialogue: () => void;
    syncCompanion: () => void;
    wipeCompanionMemory: () => void;
    setCompanionReaction: (event: "touch_ok" | "touch_blocked" | "gift" | "pause_respected" | "rushed" | "chat") => void;
  }
>()(
  persist(
    (set, get) => ({
      ...defaultState(),

      start: () => {
        get().rerollPersona();
        set({ playing: true, paused: false, panel: "none" });
        get().syncCompanion();
      },
      setLoading: (v, p = 0, err = null) =>
        set({ loading: v, loadProgress: p, loadError: err }),
      setHover: (name, desc) => set({ hoverName: name, hoverDesc: desc }),
      setUseProgress: (v) => set({ useProgress: v }),
      setPanel: (p) =>
        set({
          panel: p,
          photoMode: false,
          placeMode: p === "none" ? get().placeMode : false,
        }),
      setDialogue: (id) => set({ dialogueId: id, panel: id ? "none" : get().panel }),
      toast: (text) => {
        const id = toastSeq++;
        set({ toasts: [...get().toasts.slice(-4), { id, text }] });
        window.setTimeout(() => {
          useGameStore.getState().dismissToast(id);
        }, 2800);
      },
      dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

      addStats: (d) => {
        const s = get();
        const affection = clamp(s.affection + (d.affection ?? 0), 0, 400);
        const comfort = clamp(s.comfort + (d.comfort ?? 0), 0, 100);
        const energy = clamp(s.energy + (d.energy ?? 0), 0, 100);
        const coins = Math.max(0, s.coins + (d.coins ?? 0));
        const level = levelFromAffection(affection);
        const patch: Partial<GameState> = { affection, comfort, energy, coins, level };
        if (level > s.level) {
          Object.assign(patch, applyLevelUnlocks(s, level));
        }
        set(patch);
        if ((d.affection ?? 0) > 0) get().toast(`Affection +${d.affection}`);
        if (level > s.level) {
          get().toast(`Intimacy ${level}`);
          const startId = `level${level}_a`;
          if (!s.unlockedDialogues.includes(startId)) {
            set({
              unlockedDialogues: [...get().unlockedDialogues, startId],
              dialogueId: startId,
              seenLevelUnlock: level,
            });
          }
        }
        get().checkWin();
      },

      markInteract: (id) => {
        const interacted = get().interacted.includes(id)
          ? get().interacted
          : [...get().interacted, id];
        set({ interacted });
        const needed = ["couch", "fridge", "gift_box"];
        if (needed.every((n) => interacted.includes(n))) {
          console.log("Interact: couch, fridge, gift box");
        }
      },

      addItem: (id, kind, qty = 1) => {
        const inv = [...get().inventory];
        const found = inv.find((i) => i.id === id);
        if (found) found.qty += qty;
        else {
          if (inv.length >= 12) {
            get().toast("Inventory is full");
            return;
          }
          inv.push({ id, kind, qty });
        }
        set({ inventory: inv });
      },

      removeItem: (id, qty = 1) => {
        const inv = get().inventory.map((i) => ({ ...i }));
        const found = inv.find((i) => i.id === id);
        if (!found || found.qty < qty) return false;
        found.qty -= qty;
        set({ inventory: found.qty <= 0 ? inv.filter((i) => i.qty > 0) : inv });
        return true;
      },

      placeDecor: (item) => {
        if (!get().removeItem(item.itemId, 1)) return;
        set({ placedItems: [...get().placedItems, item] });
        get().toast("Placed");
        get().checkWin();
      },

      addPhoto: (dataUrl) => {
        const photos = [...get().photos, dataUrl].slice(-8);
        set({ photos });
        get().toast("Photograph kept");
        get().checkWin();
      },

      setOutfit: (id) => set({ outfit: id }),
      setCookingSlots: (slots) => set({ cookingSlots: slots.slice(0, 3) }),
      takeIngredient: (id) => {
        const ing = { ...get().ingredients };
        if ((ing[id] ?? 0) <= 0) return false;
        if (get().cookingSlots.length >= 3) return false;
        ing[id] -= 1;
        set({ ingredients: ing, cookingSlots: [...get().cookingSlots, id] });
        return true;
      },
      cookSuccess: (dishId, coins) => {
        get().addItem(dishId, "dish", 1);
        set({
          cookingSlots: [],
          dishesCooked: get().dishesCooked + 1,
          coins: get().coins + coins,
        });
      },
      sleepToNextDay: () => {
        const nextDay = get().day + 1;
        const coins = get().coins + 15;
        set({
          day: nextDay,
          gameMinutes: 8 * 60,
          energy: 100,
          comfort: clamp(get().comfort + 10, 0, 100),
          coins,
          plantWateredDay: get().plantWateredDay,
        });
        get().toast(`Day ${nextDay}`);
        get().rerollPersona();
        get().setDialogue("morning_1");
      },
      tickDecay: (realDt, awake) => {
        const mins = realDt / 60;
        const comfort = clamp(get().comfort - 0.2 * mins, 0, 100);
        const energy = awake
          ? clamp(get().energy - 0.5 * mins, 0, 100)
          : get().energy;
        set({ comfort, energy });
      },
      setGameMinutes: (m) => set({ gameMinutes: ((m % 1440) + 1440) % 1440 }),
      setRadio: (on) => set({ radioOn: on }),
      setLamp: (on) => set({ lampOn: on }),
      setPlaceMode: (on, itemId = null) =>
        set({ placeMode: on, placeItemId: on ? itemId : null, photoMode: false, panel: "none" }),
      setPhotoMode: (on) =>
        set({ photoMode: on, placeMode: false, panel: "none", dialogueId: on ? get().dialogueId : get().dialogueId }),
      setPlaying: (on) => set({ playing: on }),
      setPaused: (on) => set({ paused: on, panel: on ? "pause" : "none" }),
      log: (msg) => {
        set({ lastLog: msg });
        console.log(msg);
      },
      grantTutorial: () => {
        if (get().tutorialItemsGiven) return;
        get().addItem("floor_lamp", "decor");
        get().addItem("potted_fern", "decor");
        get().addItem("tea_candle", "decor");
        set({ tutorialItemsGiven: true, tutorialDone: true });
        get().toast("Three things to place");
      },
      checkWin: () => {
        const s = get();
        const ok = s.level >= 3 && s.placedItems.length >= 6 && s.photos.length >= 3;
        if (ok && !s.alphaComplete) {
          set({ alphaComplete: true, winShown: true });
          get().setDialogue("alpha_done");
        }
        return ok;
      },
      resetSave: () => {
        const keep = {
          playing: get().playing,
          loading: false,
          loadProgress: 1,
        };
        set({ ...defaultState(), ...keep });
      },
      waterPlant: () => {
        if (get().plantWateredDay === get().day) return false;
        set({ plantWateredDay: get().day });
        return true;
      },
      setConsent: (on) => {
        set((s) => ({
          consent: on,
          intimacy: on ? grantConsent(s.intimacy) : revokeConsent(s.intimacy),
        }));
        if (on) get().syncAgreementWithPersona();
      },
      setIntimacyPace: (pace) =>
        set((s) => ({ intimacy: setPace(s.intimacy, pace) })),
      openIntimacyRegion: (region) =>
        set((s) => ({
          consent: true,
          intimacy: openRegion(s.intimacy, region),
        })),
      respectIntimacyBoundary: () =>
        set((s) => ({ intimacy: respectBoundary(s.intimacy, 1) })),
      noteSharedIntimacy: () =>
        set((s) => ({ intimacy: markSharedMoment(s.intimacy) })),
      resetIntimacyAgreement: () =>
        set({ consent: false, intimacy: DEFAULT_AGREEMENT() }),
      rerollPersona: () => {
        const persona = rollPersona();
        set({ persona, consent: false, intimacy: DEFAULT_AGREEMENT() });
        get().toast(`Vivi tonight: ${dispositionLabel(persona)}`);
        get().log(`persona seed ${persona.seed}`);
      },
      learnPersonaBeat: (region, outcome, opts) =>
        set((s) => ({
          persona: learnFromBeat(s.persona, region, outcome, opts),
        })),
      tickPersonaAutonomy: () => {
        const s = get();
        const { persona, action } = autonomyTick(s.persona, {
          trust: s.intimacy.trust,
          consent: s.consent,
          now: performance.now(),
          affection: s.affection,
        });
        set({ persona });
        if (!action || s.dialogueId) return;
        if (action === "ask_talk") s.setDialogue("negotiate_hub");
        else if (action === "invite_soft") s.setDialogue("vivi_invite_soft");
        else if (action === "open_curiosity") s.setDialogue("vivi_curiosity");
        else if (action === "suggest_aftercare") s.setDialogue("aftercare_1");
      },
      syncAgreementWithPersona: () =>
        set((s) => {
          const allowed = regionsSheAllows(s.persona, s.intimacy.trust, s.consent);
          // Intersect: never force-open beyond what negotiation + persona allow
          const openRegions = allowed.filter(
            (r) =>
              r === "hands" ||
              r === "face" ||
              r === "shoulders" ||
              r === "aftercare" ||
              (s.consent && s.intimacy.openRegions.includes(r)) ||
              (s.consent && allowed.includes(r) && s.persona.memory[r]?.selfInterest > 0.55),
          );
          // unique
          const uniq = [...new Set(openRegions)];
          return {
            intimacy: { ...s.intimacy, openRegions: uniq },
          };
        }),
      setShowZones: (on) => set({ showZones: on }),
      setXrPresenting: (on) => set({ xrPresenting: on }),
      openLlmDialogue: (ctx = {}) =>
        set({ llmPanelOpen: true, llmPanelCtx: ctx, dialogueId: null }),
      closeLlmDialogue: () => set({ llmPanelOpen: false, llmPanelCtx: {} }),
      syncCompanion: () =>
        set((s) => {
          const mem = purgeExpiredRaw(s.structuredMemory);
          const companion = syncCompanionFromGame({
            prev: s.companion,
            affection: s.affection,
            comfort: s.comfort,
            energy: s.energy,
            gameMinutes: s.gameMinutes,
            intimacyTrust: s.intimacy.trust,
            consent: s.consent,
          });
          return { companion, structuredMemory: mem };
        }),
      wipeCompanionMemory: () =>
        set({ structuredMemory: wipeAllMemory() }),
      setCompanionReaction: (event) =>
        set((s) => {
          const r = reactToInteraction(s.companion, event);
          return { companion: r.state, lastLog: r.toast || s.lastLog };
        }),
    }),
    {
      name: SAVE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: SAVE_VERSION,
      partialize: (s) => ({
        version: s.version,
        day: s.day,
        gameMinutes: s.gameMinutes,
        affection: s.affection,
        comfort: s.comfort,
        energy: s.energy,
        coins: s.coins,
        level: s.level,
        inventory: s.inventory,
        placedItems: s.placedItems,
        photos: s.photos.slice(-5),
        unlockedDialogues: s.unlockedDialogues,
        outfit: s.outfit,
        unlockedOutfits: s.unlockedOutfits,
        unlockedDecor: s.unlockedDecor,
        ingredients: s.ingredients,
        cookingSlots: s.cookingSlots,
        tutorialDone: s.tutorialDone,
        tutorialItemsGiven: s.tutorialItemsGiven,
        interacted: s.interacted,
        radioOn: s.radioOn,
        lampOn: s.lampOn,
        plantWateredDay: s.plantWateredDay,
        giftedCount: s.giftedCount,
        dishesCooked: s.dishesCooked,
        alphaComplete: s.alphaComplete,
        seenLevelUnlock: s.seenLevelUnlock,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<GameSave>;
        return {
          ...current,
          ...p,
          version: SAVE_VERSION,
          ingredients: { ...STARTER_INGREDIENTS, ...(p.ingredients ?? {}) },
        };
      },
    },
  ),
);

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function inventoryHas(id: string) {
  return (useGameStore.getState().inventory.find((i) => i.id === id)?.qty ?? 0) > 0;
}
