import { useEffect, useMemo, useState } from "react";
import {
  Heart,
  Leaf,
  Battery,
  Coins,
  Package,
  ShoppingBag,
  Camera,
  Pause,
  HelpCircle,
  X,
  ChefHat,
  Shirt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGameStore } from "@/stores/gameStore";
import { DialogueBox } from "@/components/hud/DialogueBox";
import { LlmDialoguePanel } from "@/components/hud/LlmDialoguePanel";
import { CompanionPrivacyPanel } from "@/components/hud/CompanionPrivacyPanel";
import { affectionStage } from "@/companion/reactions";
import { getImmersion, immersionVignetteStyle } from "@/systems/immersionSystem";
import { formatClock } from "@/systems/scheduleSystem";
import { nextLevelNeed } from "@/systems/moodSystem";
import { unlockAudio } from "@/systems/audioSystem";
import items from "@/data/items.json";
import recipes from "@/data/recipes.json";

export function GameHUD() {
  const llmOpen = useGameStore((s) => s.llmPanelOpen);
  const llmCtx = useGameStore((s) => s.llmPanelCtx);
  const openLlm = useGameStore((s) => s.openLlmDialogue);
  const closeLlm = useGameStore((s) => s.closeLlmDialogue);
  const companion = useGameStore((s) => s.companion);
  const consent = useGameStore((s) => s.consent);
  const xrPresenting = useGameStore((s) => s.xrPresenting);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [vignette, setVignette] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setVignette(getImmersion().proximity);
    }, 120);
    return () => clearInterval(id);
  }, []);


  const playing = useGameStore((s) => s.playing);
  const loading = useGameStore((s) => s.loading);
  const loadProgress = useGameStore((s) => s.loadProgress);
  const loadError = useGameStore((s) => s.loadError);
  const winShown = useGameStore((s) => s.winShown);
  const alphaComplete = useGameStore((s) => s.alphaComplete);

  if (!playing) {
    return <StartScreen loading={loading} progress={loadProgress} error={loadError} />;
  }

  return (
    <>
      {!xrPresenting && (
        <div
          className="pointer-events-none fixed inset-0 z-[5]"
          style={{
            background: immersionVignetteStyle(vignette * (consent ? 1.1 : 0.75)),
            transition: "background 0.2s linear",
          }}
          aria-hidden
        />
      )}
      {!xrPresenting && <HudChrome />}
      <CompanionPrivacyPanel open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      {!xrPresenting && (
        <LlmDialoguePanel
          open={llmOpen}
          onClose={() => closeLlm()}
          scene={(llmCtx.scene as "negotiate") || "apartment"}
          seedNodeId={llmCtx.seedNodeId}
          zoneId={llmCtx.zoneId}
          zoneLayer={llmCtx.zoneLayer}
          gateReason={llmCtx.gateReason}
        />
      )}
      <DialogueBox />
      {!xrPresenting && <Panels />}
      <Toasts />
      {!xrPresenting && <MobileStick />}
      {winShown && alphaComplete && <WinScreen />}
    </>
  );
}

function StartScreen({
  loading,
  progress,
  error,
}: {
  loading: boolean;
  progress: number;
  error: string | null;
}) {
  const start = useGameStore((s) => s.start);
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-end bg-bg/70 px-5 pb-16 pt-10 sm:justify-center sm:pb-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface/92 p-6 shadow-overlay sm:p-8">
        <p className="font-body text-xs uppercase tracking-[0.18em] text-muted">A small apartment</p>
        <h1 className="mt-2 font-display text-3xl leading-tight tracking-tight text-fg sm:text-4xl">
          Quest Companion
        </h1>
        <p className="mt-3 font-body text-sm leading-normal text-muted">
          Live with Vivi. Cook, decorate, take pictures, and let the days accumulate.
        </p>
        <ul className="mt-5 space-y-1.5 font-body text-xs text-muted">
          <li>WASD move · mouse look · click to use</li>
          <li>E interact · I inventory · B place · P photograph</li>
          <li>Quest 3: Enter VR · left stick move · right stick snap/teleport</li>
        </ul>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <div className="mt-6">
          <Button
            size="lg"
            className="w-full"
            disabled={loading}
            onClick={() => {
              unlockAudio();
              start();
              window.__game?.start();
            }}
          >
            {loading ? `Preparing ${Math.round(progress * 100)}%` : "Step inside"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function HudChrome() {
  const day = useGameStore((s) => s.day);
  const gameMinutes = useGameStore((s) => s.gameMinutes);
  const affection = useGameStore((s) => s.affection);
  const comfort = useGameStore((s) => s.comfort);
  const energy = useGameStore((s) => s.energy);
  const coins = useGameStore((s) => s.coins);
  const level = useGameStore((s) => s.level);
  const hoverName = useGameStore((s) => s.hoverName);
  const hoverDesc = useGameStore((s) => s.hoverDesc);
  const useProgress = useGameStore((s) => s.useProgress);
  const photoMode = useGameStore((s) => s.photoMode);
  const placeMode = useGameStore((s) => s.placeMode);
  const panel = useGameStore((s) => s.panel);
  const setPanel = useGameStore((s) => s.setPanel);
  const setPaused = useGameStore((s) => s.setPaused);
  const consent = useGameStore((s) => s.consent);
  const intimacy = useGameStore((s) => s.intimacy);
  const persona = useGameStore((s) => s.persona);
  const setConsent = useGameStore((s) => s.setConsent);
  const setDialogue = useGameStore((s) => s.setDialogue);
  const showZones = useGameStore((s) => s.showZones);
  const setShowZones = useGameStore((s) => s.setShowZones);
  const need = nextLevelNeed(affection);
  const layer = Math.min(level, 2);

  if (photoMode) {
    return (
      <div className="pointer-events-none absolute inset-0 z-20 border-[12px] border-fg/80">
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 font-body text-xs text-bg">
          Click to keep this photograph · Esc to leave
        </p>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-lg border border-border bg-surface/90 px-3 py-2 shadow-overlay">
          <p className="font-display text-sm text-fg">
            Day {day}
            <span className="ml-2 font-body tabular-nums text-muted">{formatClock(gameMinutes)}</span>
          </p>
          <p className="mt-0.5 font-body text-xs text-muted">
            Intimacy {level} · {Math.round(need.t * 100)}%
          </p>
        </div>
        <div className="pointer-events-auto flex gap-1">
          <IconBtn label="Inventory" onClick={() => setPanel(panel === "inventory" ? "none" : "inventory")}>
            <Package className="size-4" />
          </IconBtn>
          <IconBtn label="Shop" onClick={() => setPanel(panel === "shop" ? "none" : "shop")}>
            <ShoppingBag className="size-4" />
          </IconBtn>
          <IconBtn label="Pause" onClick={() => setPaused(true)}>
            <Pause className="size-4" />
          </IconBtn>
        </div>
      </div>

      <div className="mt-3 flex max-w-xs flex-col gap-1.5 rounded-lg border border-border bg-surface/90 p-3">
        <Stat icon={<Heart className="size-3.5" />} label="Affection" value={affection} max={300} />
        <Stat icon={<Leaf className="size-3.5" />} label="Comfort" value={comfort} max={100} />
        <Stat icon={<Battery className="size-3.5" />} label="Energy" value={energy} max={100} />
        <div className="flex items-center gap-2 pt-1 text-xs text-muted">
          <Coins className="size-3.5" />
          <span className="tabular-nums text-fg">{coins}</span>
          <span className="ml-auto text-[10px] uppercase tracking-wide">
            Layer {layer} · {affectionStage(companion.girlfriendAffection)}
          </span>
        </div>
        <div className="pointer-events-auto mt-1 flex flex-col gap-1.5 border-t border-border/60 pt-2 text-[11px] text-muted">
          <p className="text-[10px] leading-snug text-fg/80">
            <span className="block text-[10px] text-fg/70">{persona?.lastThought ?? "…"}</span>
            {consent
              ? `Mutual · ${intimacy.pace} · ${intimacy.openRegions.slice(0, 3).join(", ")}`
              : "Closer touch: negotiate together"}
          </p>
          <button
            type="button"
            className="rounded border border-border bg-surface-2 px-2 py-1 text-left text-[11px] text-fg hover:border-accent"
            onClick={() => setDialogue("negotiate_hub")}
          >
            Talk about boundaries…
          </button>
          <button
            type="button"
            className="rounded border border-accent/50 bg-surface-2 px-2 py-1 text-left text-[11px] text-fg hover:border-accent"
            onClick={() => openLlm({ scene: "negotiate" })}
          >
            Live talk (LLM)…
          </button>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="accent-accent"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>Session consent (soft zones)</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="accent-accent"
              checked={showZones}
              onChange={(e) => setShowZones(e.target.checked)}
            />
            <span>Zone toasts (debug)</span>
          </label>
        </div>
      </div>

      {(hoverName || placeMode) && (
        <div className="absolute bottom-24 left-1/2 w-[min(28rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-lg border border-border bg-surface/92 px-4 py-3 text-center shadow-overlay sm:bottom-10">
          <p className="font-display text-sm text-fg">{placeMode ? "Place mode" : hoverName}</p>
          <p className="mt-1 font-body text-xs leading-snug text-muted">
            {placeMode ? "Click the floor to set the piece down." : hoverDesc}
          </p>
          {useProgress > 0 && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-accent" style={{ width: `${Math.min(100, useProgress * 100)}%` }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  max,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  max: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="flex items-center gap-1.5 text-fg">
          {icon}
          {label}
        </span>
        <span className="tabular-nums">{Math.round(value)}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-accent" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex size-11 items-center justify-center rounded-md border border-border bg-surface text-fg hover:bg-surface-2"
    >
      {children}
    </button>
  );
}

function Panels() {
  const panel = useGameStore((s) => s.panel);
  const setPanel = useGameStore((s) => s.setPanel);
  const setPaused = useGameStore((s) => s.setPaused);
  if (panel === "none") return null;
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-end justify-center bg-bg/40 p-3 sm:items-center">
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-4 shadow-overlay sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg text-fg">
            {panel === "inventory" && "Inventory"}
            {panel === "shop" && "Gift box"}
            {panel === "fridge" && "Fridge"}
            {panel === "cook" && "Cooking"}
            {panel === "wardrobe" && "Wardrobe"}
            {panel === "gallery" && "Photographs"}
            {panel === "pause" && "Paused"}
            {panel === "help" && "Help"}
          </h2>
          <button
            type="button"
            aria-label="Close"
            className="inline-flex size-11 items-center justify-center rounded-md text-muted hover:bg-surface-2"
            onClick={() => {
              setPanel("none");
              setPaused(false);
            }}
          >
            <X className="size-4" />
          </button>
        </div>
        {panel === "inventory" && <InventoryPanel />}
        {panel === "shop" && <ShopPanel />}
        {panel === "fridge" && <FridgePanel />}
        {panel === "cook" && <CookPanel />}
        {panel === "wardrobe" && <WardrobePanel />}
        {panel === "gallery" && <GalleryPanel />}
        {panel === "pause" && <PausePanel />}
      </div>
    </div>
  );
}

function InventoryPanel() {
  const inventory = useGameStore((s) => s.inventory);
  const setPlaceMode = useGameStore((s) => s.setPlaceMode);
  const setPanel = useGameStore((s) => s.setPanel);
  const names = useMemo(() => {
    const all = [...items.decor, ...items.shop, ...items.ingredients];
    return Object.fromEntries(all.map((i) => [i.id, i.name]));
  }, []);
  if (!inventory.length) {
    return <p className="font-body text-sm text-muted">Empty pockets. The fridge and gift box can help.</p>;
  }
  return (
    <ul className="grid grid-cols-2 gap-2">
      {inventory.map((it) => (
        <li key={it.id}>
          <button
            type="button"
            className="flex h-auto min-h-11 w-full flex-col items-start rounded-md border border-border bg-surface-2 px-3 py-2 text-left"
            onClick={() => {
              if (it.kind === "decor") {
                setPanel("none");
                setPlaceMode(true, it.id);
              }
            }}
          >
            <span className="font-body text-sm text-fg">{names[it.id] ?? it.id}</span>
            <span className="text-xs text-muted">
              {it.kind} · {it.qty}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ShopPanel() {
  const coins = useGameStore((s) => s.coins);
  const addItem = useGameStore((s) => s.addItem);
  const addStats = useGameStore((s) => s.addStats);
  const toast = useGameStore((s) => s.toast);
  return (
    <ul className="flex flex-col gap-2">
      {items.shop.map((it) => (
        <li key={it.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
          <div>
            <p className="font-body text-sm text-fg">{it.name}</p>
            <p className="text-xs text-muted">{it.description}</p>
          </div>
          <Button
            size="sm"
            disabled={coins < it.price}
            onClick={() => {
              addStats({ coins: -it.price });
              addItem(it.id, "gift");
              toast(`Bought ${it.name}`);
            }}
          >
            {it.price}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function FridgePanel() {
  const ingredients = useGameStore((s) => s.ingredients);
  const cookingSlots = useGameStore((s) => s.cookingSlots);
  const takeIngredient = useGameStore((s) => s.takeIngredient);
  const setCookingSlots = useGameStore((s) => s.setCookingSlots);
  const setPanel = useGameStore((s) => s.setPanel);
  const names = Object.fromEntries(items.ingredients.map((i) => [i.id, i.name]));
  return (
    <div>
      <p className="mb-3 font-body text-sm text-muted">
        Choose three. Then use the kitchen counter.{" "}
        {recipes.map((r) => r.name).join(" · ")}
      </p>
      <div className="mb-3 flex gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex h-11 flex-1 items-center justify-center rounded-md border border-border bg-surface-2 text-xs text-muted"
          >
            {cookingSlots[i] ? names[cookingSlots[i]!] : "—"}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.ingredients.map((ing) => (
          <Button
            key={ing.id}
            variant="secondary"
            disabled={(ingredients[ing.id] ?? 0) <= 0 || cookingSlots.length >= 3}
            onClick={() => takeIngredient(ing.id)}
          >
            {ing.name} · {ingredients[ing.id] ?? 0}
          </Button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="outline" onClick={() => setCookingSlots([])}>
          Clear
        </Button>
        <Button onClick={() => setPanel("none")}>To the counter</Button>
      </div>
    </div>
  );
}

function CookPanel() {
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <ChefHat className="size-8 text-accent" />
      <p className="font-body text-sm text-muted">The pan is working. Stay a moment.</p>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full w-1/2 animate-pulse bg-accent" />
      </div>
    </div>
  );
}

function WardrobePanel() {
  const outfit = useGameStore((s) => s.outfit);
  const unlocked = useGameStore((s) => s.unlockedOutfits);
  const setOutfit = useGameStore((s) => s.setOutfit);
  const toast = useGameStore((s) => s.toast);
  return (
    <ul className="flex flex-col gap-2">
      {items.outfits.map((o) => {
        const open = unlocked.includes(o.id);
        return (
          <li key={o.id}>
            <Button
              variant={outfit === o.id ? "default" : "secondary"}
              className="w-full justify-start"
              disabled={!open}
              onClick={() => {
                setOutfit(o.id);
                toast(o.name);
              }}
            >
              <Shirt className="size-4" />
              {o.name}
              {!open && <span className="ml-auto text-xs text-muted">Intimacy {o.unlockLevel}</span>}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function GalleryPanel() {
  const photos = useGameStore((s) => s.photos);
  const setPhotoMode = useGameStore((s) => s.setPhotoMode);
  const setPanel = useGameStore((s) => s.setPanel);
  return (
    <div>
      <p className="mb-3 font-body text-sm text-muted">
        Three early pictures live here. Press P in the apartment to take more.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {["/photos/living.jpg", "/photos/bedroom.jpg", "/photos/kitchen.jpg"].map((src) => (
          <img key={src} src={src} alt="" className="aspect-[3/2] rounded-sm object-cover" />
        ))}
        {photos.map((p, i) => (
          <img key={i} src={p} alt="" className="aspect-[3/2] rounded-sm object-cover" />
        ))}
      </div>
      <Button
        className="mt-4 w-full"
        onClick={() => {
          setPanel("none");
          setPhotoMode(true);
        }}
      >
        <Camera className="size-4" />
        Photograph
      </Button>
    </div>
  );
}

function PausePanel() {
  const resetSave = useGameStore((s) => s.resetSave);
  const setPaused = useGameStore((s) => s.setPaused);
  const setPanel = useGameStore((s) => s.setPanel);
  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={() => {
          setPaused(false);
          setPanel("none");
        }}
      >
        Resume
      </Button>
      <Button variant="secondary" onClick={() => setPanel("help")}>
        <HelpCircle className="size-4" />
        Controls
      </Button>
      <Button variant="outline" onClick={resetSave}>
        New save
      </Button>
      <p className="mt-2 font-body text-xs leading-normal text-muted">
        WASD move. Mouse look. Click objects. Click Vivi to touch. I inventory, B place, P photograph, M shop. Sleep
        in the bed to advance the day.
      </p>
    </div>
  );
}

function Toasts() {
  const toasts = useGameStore((s) => s.toasts);
  return (
    <div className="pointer-events-none absolute right-3 top-24 z-40 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="rounded-md border border-border bg-surface px-3 py-2 font-body text-xs text-fg shadow-overlay"
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

function WinScreen() {
  const day = useGameStore((s) => s.day);
  const level = useGameStore((s) => s.level);
  const setPanel = useGameStore((s) => s.setPanel);
  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-bg/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 text-center shadow-overlay">
        <p className="font-body text-xs uppercase tracking-[0.16em] text-muted">Alpha complete</p>
        <h2 className="mt-2 font-display text-2xl text-fg">
          Day {day}, Intimacy {level}
        </h2>
        <p className="mt-3 font-body text-sm leading-normal text-muted">
          The apartment kept your fingerprints. Vivi kept the days.
        </p>
        <Button className="mt-6 w-full" onClick={() => useGameStore.setState({ winShown: false })}>
          Stay a little longer
        </Button>
      </div>
    </div>
  );
}

function MobileStick() {
  const playing = useGameStore((s) => s.playing);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setShow(mq.matches);
    const fn = () => setShow(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  if (!playing || !show) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-between p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Joystick
        onChange={(x, y) => {
          const g = window.__game;
          void g;
          const canvas = document.querySelector("canvas");
          void canvas;
          import("@/game/engine").catch(() => undefined);
        }}
      />
      <div className="pointer-events-auto flex flex-col gap-2">
        <button
          type="button"
          className="size-14 rounded-full border border-border bg-surface/90 text-fg"
          aria-label="Interact"
          onPointerDown={() => {
            const ev = new KeyboardEvent("keydown", { code: "KeyE" });
            window.dispatchEvent(ev);
          }}
        >
          Use
        </button>
      </div>
    </div>
  );
}

function Joystick({ onChange }: { onChange: (x: number, y: number) => void }) {
  return (
    <div
      className="pointer-events-auto size-28 rounded-full border border-border bg-surface/70"
      onPointerDown={(e) => {
        const el = e.currentTarget;
        const move = (ev: PointerEvent) => {
          const r = el.getBoundingClientRect();
          const x = (ev.clientX - r.left) / r.width * 2 - 1;
          const y = -((ev.clientY - r.top) / r.height * 2 - 1);
          const m = Math.hypot(x, y) || 1;
          onChange(x / Math.max(1, m), y / Math.max(1, m));
        };
        const up = () => {
          onChange(0, 0);
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        move(e.nativeEvent);
      }}
    />
    </>
  );
}

void Box;
void ImageIcon;
void cn;
void HelpCircle;
