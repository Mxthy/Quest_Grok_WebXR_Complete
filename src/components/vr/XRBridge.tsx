import { useEffect, useState } from "react";
import { VROverlay } from "@/components/vr/VROverlay";
import type { XRSessionInfo } from "@/xr/XRSessionManager";
import type { XRDiagSnapshot } from "@/xr/XRDiagnostics";

type XRApi = {
  start: () => Promise<boolean>;
  end: () => Promise<void>;
  getInfo: () => XRSessionInfo;
  isPresenting: () => boolean;
  getDiagnostics: () => XRDiagSnapshot;
  reloadComfort: () => void;
};

export function XRBridge() {
  const [info, setInfo] = useState<XRSessionInfo | null>(null);
  const [diag, setDiag] = useState<XRDiagSnapshot | null>(null);
  const [presenting, setPresenting] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      const api = (window as unknown as { __xr?: XRApi }).__xr;
      if (!api) return;
      try {
        setInfo(api.getInfo() as XRSessionInfo);
        setPresenting(!!api.isPresenting());
        setDiag(api.getDiagnostics() as XRDiagSnapshot);
      } catch {
        /* */
      }
    }, 400);
    return () => clearInterval(id);
  }, []);

  return (
    <VROverlay
      sessionInfo={info}
      diagnostics={diag}
      presenting={presenting}
      onEnterVR={() => {
        const api = (window as unknown as { __xr?: XRApi }).__xr;
        void api?.start();
      }}
      onExitVR={() => {
        const api = (window as unknown as { __xr?: XRApi }).__xr;
        void api?.end();
      }}
    />
  );
}
