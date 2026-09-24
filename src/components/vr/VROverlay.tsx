/**
 * Screen-space VR chrome when presenting — Enter VR button + diagnostics + comfort.
 * World-space panels are driven from the engine; this is the 2D HUD companion for Quest browser chrome.
 */
import { useEffect, useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { getCapabilities, probeImmersiveVR } from "@/platform/PlatformCapabilities";
import { loadComfort, updateComfort, type VRComfortConfig } from "@/xr/VRComfortSettings";
import type { XRSessionInfo } from "@/xr/XRSessionManager";
import type { XRDiagSnapshot } from "@/xr/XRDiagnostics";

type Props = {
  sessionInfo: XRSessionInfo | null;
  diagnostics: XRDiagSnapshot | null;
  onEnterVR: () => void;
  onExitVR: () => void;
  presenting: boolean;
};

export function VROverlay({
  sessionInfo,
  diagnostics,
  onEnterVR,
  onExitVR,
  presenting,
}: Props) {
  const [vrOk, setVrOk] = useState(false);
  const [comfort, setComfort] = useState<VRComfortConfig>(() => loadComfort());
  const [showComfort, setShowComfort] = useState(false);
  const [showDiag, setShowDiag] = useState(false);
  const consent = useGameStore((s) => s.consent);
  const setConsent = useGameStore((s) => s.setConsent);

  useEffect(() => {
    void probeImmersiveVR().then(setVrOk);
  }, []);

  const caps = getCapabilities();
  const canVR = vrOk || sessionInfo?.state === "available" || sessionInfo?.state === "presenting";

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {/* Enter / Exit VR */}
      <div className="pointer-events-auto absolute bottom-4 right-4 flex flex-col items-end gap-2">
        {canVR && !presenting && (
          <button
            type="button"
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black shadow-lg hover:bg-zinc-100"
            onClick={() => {
              onEnterVR();
            }}
          >
            Enter VR
          </button>
        )}
        {presenting && (
          <button
            type="button"
            className="rounded-lg bg-black/80 px-3 py-1.5 text-xs text-white"
            onClick={onExitVR}
          >
            Exit VR
          </button>
        )}
        <div className="flex gap-1">
          <button
            type="button"
            className="rounded bg-black/60 px-2 py-1 text-[10px] text-white/80"
            onClick={() => setShowComfort((v) => !v)}
          >
            Comfort
          </button>
          <button
            type="button"
            className="rounded bg-black/60 px-2 py-1 text-[10px] text-white/80"
            onClick={() => setShowDiag((v) => !v)}
          >
            XR Diag
          </button>
        </div>
      </div>

      {/* Status pill */}
      <div className="absolute left-3 top-14 rounded bg-black/55 px-2 py-1 text-[10px] text-white/70">
        XR: {sessionInfo?.state ?? (caps.webxr ? "probing" : "unsupported")}
        {sessionInfo?.referenceSpaceType && sessionInfo.referenceSpaceType !== "none"
          ? ` · ${sessionInfo.referenceSpaceType}`
          : ""}
        {presenting ? " · PRESENTING" : ""}
      </div>

      {showComfort && (
        <div className="pointer-events-auto absolute bottom-24 right-4 w-56 rounded-lg border border-white/15 bg-black/85 p-3 text-xs text-white">
          <p className="mb-2 font-medium tracking-wide">Comfort</p>
          <label className="mb-1 flex items-center justify-between gap-2">
            <span>Smooth move</span>
            <input
              type="checkbox"
              checked={comfort.smoothEnabled}
              onChange={(e) => setComfort(updateComfort({ smoothEnabled: e.target.checked }))}
            />
          </label>
          <label className="mb-1 flex items-center justify-between gap-2">
            <span>Teleport</span>
            <input
              type="checkbox"
              checked={comfort.teleportEnabled}
              onChange={(e) => setComfort(updateComfort({ teleportEnabled: e.target.checked }))}
            />
          </label>
          <label className="mb-1 flex items-center justify-between gap-2">
            <span>Snap turn</span>
            <input
              type="checkbox"
              checked={comfort.turn === "snap"}
              onChange={(e) =>
                setComfort(updateComfort({ turn: e.target.checked ? "snap" : "smooth" }))
              }
            />
          </label>
          <label className="mb-1 flex items-center justify-between gap-2">
            <span>Speed {comfort.moveSpeed.toFixed(1)}</span>
            <input
              type="range"
              min={0.8}
              max={2.8}
              step={0.1}
              value={comfort.moveSpeed}
              onChange={(e) =>
                setComfort(updateComfort({ moveSpeed: Number(e.target.value) }))
              }
            />
          </label>
          <label className="mb-1 flex items-center justify-between gap-2">
            <span>Snap ° {comfort.snapAngleDeg}</span>
            <input
              type="range"
              min={15}
              max={90}
              step={15}
              value={comfort.snapAngleDeg}
              onChange={(e) =>
                setComfort(updateComfort({ snapAngleDeg: Number(e.target.value) }))
              }
            />
          </label>
          <label className="mt-2 flex items-center justify-between gap-2 border-t border-white/10 pt-2">
            <span>Consent L1/L2</span>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
          </label>
        </div>
      )}

      {showDiag && diagnostics && (
        <div className="pointer-events-none absolute left-3 top-24 max-w-xs rounded-lg border border-white/15 bg-black/80 p-3 font-mono text-[10px] leading-relaxed text-emerald-200/90">
          <p>XR Session: {diagnostics.xrSession}</p>
          <p>Ref Space: {diagnostics.referenceSpace}</p>
          <p>Left Ctrl: {diagnostics.leftController}</p>
          <p>Right Ctrl: {diagnostics.rightController}</p>
          <p>Trigger: {diagnostics.trigger}</p>
          <p>Grip: {diagnostics.grip}</p>
          <p>Thumbstick: {diagnostics.thumbstick}</p>
          <p>FPS: {diagnostics.fps}</p>
          <p>Frame: {diagnostics.frameMs} ms</p>
          <p>DrawCalls: {diagnostics.drawCalls}</p>
          <p>Triangles: {diagnostics.triangles}</p>
          <p>VRM: {diagnostics.vrm}</p>
          <p>Audio: {diagnostics.audio}</p>
        </div>
      )}
    </div>
  );
}
