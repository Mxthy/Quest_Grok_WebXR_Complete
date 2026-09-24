import { useGameStore } from "@/stores/gameStore";
import { privacyDisclosure } from "@/companion/privacy/policy";
import { affectionStage } from "@/companion/reactions";
import { Button } from "@/components/ui/button";

/** Transparency UI: state, memory list, delete controls */
export function CompanionPrivacyPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const companion = useGameStore((s) => s.companion);
  const memory = useGameStore((s) => s.structuredMemory);
  const wipe = useGameStore((s) => s.wipeCompanionMemory);
  const remove = (id: string) => {
    useGameStore.setState((s) => ({
      structuredMemory: {
        ...s.structuredMemory,
        semantic: s.structuredMemory.semantic.filter((f) => f.id !== id),
      },
    }));
  };

  if (!open) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-4 shadow-overlay">
        <h2 className="font-display text-lg text-fg">Companion · Privacy</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted">{privacyDisclosure()}</p>

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded border border-border p-2">
            <div className="text-muted">Presence</div>
            <div className="text-fg">{companion.presence}</div>
          </div>
          <div className="rounded border border-border p-2">
            <div className="text-muted">Trust</div>
            <div className="text-fg">{Math.round(companion.trust)}</div>
          </div>
          <div className="rounded border border-border p-2">
            <div className="text-muted">Warmth</div>
            <div className="text-fg">{companion.warmth}</div>
          </div>
          <div className="rounded border border-border p-2">
            <div className="text-muted">Girlfriend</div>
            <div className="text-fg">
              {affectionStage(companion.girlfriendAffection)} ({companion.girlfriendAffection})
            </div>
          </div>
          <div className="rounded border border-border p-2 col-span-2">
            <div className="text-muted">Consent scope</div>
            <div className="text-fg">{companion.consentScope.join(", ")}</div>
          </div>
          <div className="rounded border border-border p-2 col-span-2">
            <div className="text-muted">Last reaction</div>
            <div className="text-fg">{companion.lastReaction}</div>
          </div>
        </div>

        <h3 className="mt-4 text-sm font-medium text-fg">Semantic memory (editable)</h3>
        <ul className="mt-2 space-y-1 text-xs">
          {memory.semantic.length === 0 && (
            <li className="text-muted">No long-term facts yet.</li>
          )}
          {memory.semantic.map((f) => (
            <li key={f.id} className="flex items-start justify-between gap-2 rounded border border-border/60 px-2 py-1">
              <span>
                <span className="text-muted">{f.key}:</span> {f.value}
              </span>
              <button type="button" className="text-accent" onClick={() => remove(f.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>

        <h3 className="mt-4 text-sm font-medium text-fg">Episodic summaries</h3>
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {memory.episodic.slice(-8).map((e) => (
            <li key={e.id}>• {e.summary}</li>
          ))}
          {memory.episodic.length === 0 && <li>None yet.</li>}
        </ul>

        <div className="mt-4 flex justify-between gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              wipe();
            }}
          >
            Wipe all memory
          </Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
