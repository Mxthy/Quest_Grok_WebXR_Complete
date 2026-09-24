import { useEffect } from "react";
import { useGameStore } from "@/stores/gameStore";
import { Button } from "@/components/ui/button";
import {
  getDialogueNode,
  enterDialogueNode,
  continueDialogue,
  chooseDialogue,
} from "@/systems/dialogueActions";

export function DialogueBox() {
  const id = useGameStore((s) => s.dialogueId);
  const xr = useGameStore((s) => s.xrPresenting);
  const node = getDialogueNode(id);

  useEffect(() => {
    enterDialogueNode(id);
  }, [id]);

  if (!node || xr) return null;

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex justify-center p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-surface/95 p-4 shadow-overlay sm:p-5">
        <p className="font-display text-sm tracking-tight text-accent">{node.speaker}</p>
        <p className="mt-2 font-body text-base leading-normal text-fg">{node.text}</p>
        {node.choices?.length ? (
          <div className="mt-4 flex flex-col gap-2">
            {node.choices.map((c) => (
              <Button
                key={c.id}
                variant="secondary"
                className="h-auto min-h-11 justify-start py-2 text-left"
                onClick={() => chooseDialogue(c.id)}
              >
                {c.label}
              </Button>
            ))}
          </div>
        ) : (
          <div className="mt-4 flex justify-end">
            <Button onClick={() => continueDialogue()}>Continue</Button>
          </div>
        )}
      </div>
    </div>
  );
}
