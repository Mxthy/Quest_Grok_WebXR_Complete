import { useCallback, useEffect, useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import {
  dialogueLLM,
  buildGameSnapFromStore,
  type LlmReply,
  type LlmChoice,
} from "@/llm";
import { Button } from "@/components/ui/button";

type Scene =
  | "apartment"
  | "touch"
  | "negotiate"
  | "aftercare"
  | "daily"
  | "gift"
  | "cook"
  | "photo";

type Props = {
  open: boolean;
  onClose: () => void;
  scene?: Scene;
  seedNodeId?: string;
  zoneId?: string;
  zoneLayer?: number;
  gateReason?: string;
};

/**
 * LLM dialogue layer UI — REST-backed, memory-aware, scripted fallback.
 */
export function LlmDialoguePanel({
  open,
  onClose,
  scene = "apartment",
  seedNodeId,
  zoneId,
  zoneLayer,
  gateReason,
}: Props) {
  const [reply, setReply] = useState<LlmReply | null>(null);
  const [partial, setPartial] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setConsent = useGameStore((s) => s.setConsent);
  const openRegion = useGameStore((s) => s.openIntimacyRegion);
  const setPace = useGameStore((s) => s.setIntimacyPace);
  const respect = useGameStore((s) => s.respectIntimacyBoundary);
  const noteShared = useGameStore((s) => s.noteSharedIntimacy);
  const sync = useGameStore((s) => s.syncAgreementWithPersona);

  const applyEffects = useCallback(
    (effects?: LlmChoice["effect"][]) => {
      if (!effects?.length) return;
      for (const e of effects) {
        if (e === "consent_yes" || e === "open_soft") {
          setConsent(true);
          openRegion("soft_torso");
        }
        if (e === "consent_no") setConsent(false);
        if (e === "pace_slow") setPace("slow");
        if (e === "pace_medium") setPace("medium");
        if (e === "open_close") {
          const trust = useGameStore.getState().intimacy.trust;
          if (trust >= 2) {
            setConsent(true);
            openRegion("soft_torso");
            openRegion("close");
          }
        }
        if (e === "pause") respect();
        if (e === "aftercare") noteShared();
      }
      sync();
    },
    [setConsent, openRegion, setPace, respect, noteShared, sync],
  );

  const run = useCallback(
    async (playerInput?: string) => {
      setBusy(true);
      setError(null);
      setPartial("");
      try {
        const snap = buildGameSnapFromStore({
          scene,
          seedNodeId,
          zoneId,
          zoneLayer,
          gateReason,
          playerInput,
        });
        const r = await dialogueLLM.generate(snap, setPartial);
        setReply(r);
        applyEffects(r.effects);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [scene, seedNodeId, zoneId, zoneLayer, gateReason, applyEffects],
  );

  useEffect(() => {
    if (!open) return;
    setReply(null);
    void run();
    return () => dialogueLLM.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open edge only
  }, [open]);

  if (!open) return null;

  const text = partial || reply?.text || (busy ? "…" : "");

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 flex justify-center p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-surface/95 p-4 shadow-overlay sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="font-display text-sm tracking-tight text-accent">Vivi</p>
          <span className="text-[10px] uppercase tracking-wide text-muted">
            {dialogueLLM.status === "streaming"
              ? "live"
              : dialogueLLM.status === "fallback"
                ? "offline script"
                : dialogueLLM.status}
          </span>
        </div>
        <p className="mt-2 min-h-[3rem] font-body text-base leading-normal text-fg">{text}</p>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        <div className="mt-4 flex flex-col gap-2">
          {(reply?.choices ?? []).map((c) => (
            <Button
              key={c.id}
              variant="secondary"
              className="h-auto min-h-11 justify-start py-2 text-left"
              disabled={busy}
              onClick={() => {
                dialogueLLM.notePlayerChoice(c.label, zoneId);
                applyEffects(c.effect ? [c.effect] : undefined);
                void run(c.label);
              }}
            >
              {c.label}
            </Button>
          ))}
          <div className="mt-1 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void run("Tell me more.")}
              disabled={busy}
            >
              More
            </Button>
            <Button
              size="sm"
              onClick={() => {
                dialogueLLM.cancel();
                setReply(null);
                onClose();
              }}
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
