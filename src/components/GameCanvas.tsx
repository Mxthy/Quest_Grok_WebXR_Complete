import { useEffect, useRef } from "react";

export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 size-full touch-none";
    canvas.setAttribute("aria-label", "Apartment");
    host.appendChild(canvas);
    let stop = () => {};
    let alive = true;
    void import("@/game/engine").then((m) => {
      if (!alive) return;
      stop = m.createGame(canvas, host);
    });
    return () => {
      alive = false;
      stop();
      canvas.remove();
    };
  }, []);

  return <div ref={hostRef} className="absolute inset-0 bg-bg" />;
}
