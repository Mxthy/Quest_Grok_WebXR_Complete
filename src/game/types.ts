export type Vec3 = [number, number, number];

export type ItemKind = "decor" | "gift" | "ingredient" | "dish";
export type PlaceTarget = "floor" | "wall";

export type InventoryItem = {
  id: string;
  kind: ItemKind;
  qty: number;
};

export type PlacedItem = {
  uid: string;
  itemId: string;
  position: Vec3;
  rotationY: number;
  wall: boolean;
};

export type DialogueChoice = {
  id: string;
  label: string;
  next: string | null;
  affection?: number;
};

export type DialogueNode = {
  id: string;
  speaker: string;
  text: string;
  expression: string;
  affection: number;
  comfort?: number;
  next?: string | null;
  choices?: DialogueChoice[];
  grant?: string[];
};

export type InteractableDef = {
  id: string;
  name: string;
  description: string;
  position: Vec3;
  radius: number;
  useTime: number;
  kind: string;
  affection: number;
  comfort: number;
  energy: number;
  dialogue?: string;
  room: string;
};

export type ZoneDef = {
  id: string;
  bone: string;
  radius: number;
  offset: Vec3;
  affection: number;
  comfort: number;
  expression: string;
  /** 0 = open · 1 = consent · 2 = consent + level */
  layer?: number;
  /** seconds between triggers for this zone */
  cooldown?: number;
  /** ms for navigator.vibrate / XR haptics */
  haptic?: number;
  /** minimum player level (from affection) */
  requiresLevel?: number;
  interactionType?: string;
  allowedInput?: string[];
  feedback?: string;
  requiresConsent?: boolean;
  /** energy spent on successful hit */
  energyCost?: number;
  /** base coins before strength scale */
  coins?: number;
  /** dialogue node id override */
  dialogueId?: string;
  audio?: string;
  animation?: string;
  gameplayEffect?: string;
  tags?: string[];
};

export type RecipeDef = {
  id: string;
  name: string;
  description: string;
  ingredients: string[];
  comfort: number;
  affection: number;
  coins: number;
  cookTime: number;
};

export type ShopItem = {
  id: string;
  name: string;
  description: string;
  kind: ItemKind;
  price: number;
  affection: number;
  comfort: number;
};

export type DecorItem = {
  id: string;
  name: string;
  description: string;
  kind: "decor";
  place: PlaceTarget;
  unlockLevel: number;
  icon: string;
};

export type OutfitDef = {
  id: string;
  name: string;
  unlockLevel: number;
  cloth: string;
  hair: string;
};

export type Toast = {
  id: number;
  text: string;
};

export type UiPanel =
  | "none"
  | "inventory"
  | "shop"
  | "fridge"
  | "cook"
  | "wardrobe"
  | "gallery"
  | "pause"
  | "help";

export const LEVEL_THRESHOLDS = [0, 20, 50, 100, 180, 300] as const;
export const SAVE_KEY = "quest-companion-apartment-alpha";
export const SAVE_VERSION = 1;

export function levelFromAffection(affection: number): number {
  let level = 0;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (affection >= LEVEL_THRESHOLDS[i]!) level = i;
  }
  return level;
}
