import { createFileRoute } from "@tanstack/react-router";
import { GameCanvas } from "@/components/GameCanvas";
import { GameHUD } from "@/components/hud/GameHUD";
import { XRBridge } from "@/components/vr/XRBridge";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-bg text-fg">
      <GameCanvas />
      <GameHUD />
      <XRBridge />
    </main>
  );
}
