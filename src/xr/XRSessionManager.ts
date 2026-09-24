/**
 * Central WebXR session lifecycle using Three.js WebXRManager.
 * KB: life-vibe/threejs/webgl2-xr — renderer.xr.enabled + setAnimationLoop.
 */
import type * as THREE from "three";
import { probeImmersiveVR, getCapabilities } from "@/platform/PlatformCapabilities";

export type XRSessionState =
  | "unsupported"
  | "available"
  | "requesting"
  | "presenting"
  | "ending"
  | "error";

export type XRSessionInfo = {
  state: XRSessionState;
  referenceSpaceType: "local-floor" | "local" | "none";
  error: string | null;
  session: XRSession | null;
};

type Listener = (info: XRSessionInfo) => void;

export class XRSessionManager {
  private renderer: THREE.WebGLRenderer;
  private info: XRSessionInfo = {
    state: "unsupported",
    referenceSpaceType: "none",
    error: null,
    session: null,
  };
  private listeners = new Set<Listener>();
  private onEndBound = this.onSessionEnd.bind(this);

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    try {
      renderer.xr.enabled = true;
    } catch {
      /* ignore */
    }
  }

  getInfo(): XRSessionInfo {
    return { ...this.info };
  }

  isPresenting(): boolean {
    return this.info.state === "presenting" && !!this.renderer.xr.isPresenting;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.getInfo());
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const snap = this.getInfo();
    for (const fn of this.listeners) {
      try {
        fn(snap);
      } catch {
        /* ignore listener errors */
      }
    }
  }

  private set(partial: Partial<XRSessionInfo>) {
    Object.assign(this.info, partial);
    this.emit();
  }

  async init(): Promise<boolean> {
    const caps = getCapabilities();
    if (!caps.webxr || !caps.isSecureContext) {
      this.set({
        state: "unsupported",
        error: caps.isSecureContext ? "No WebXR" : "Needs HTTPS",
      });
      return false;
    }
    const ok = await probeImmersiveVR();
    if (!ok) {
      this.set({ state: "unsupported", error: "immersive-vr not supported" });
      return false;
    }
    this.set({ state: "available", error: null });
    return true;
  }

  async start(): Promise<boolean> {
    if (this.isPresenting()) return true;
    if (this.info.state === "requesting") return false;

    this.set({ state: "requesting", error: null });
    try {
      const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
      if (!xr) {
        this.set({ state: "error", error: "navigator.xr missing" });
        return false;
      }

      // Never require local-floor — Quest Browser usually has it, desktop emulators may not.
      let session: XRSession;
      try {
        session = await xr.requestSession("immersive-vr", {
          optionalFeatures: [
            "local-floor",
            "bounded-floor",
            "local",
            "hand-tracking",
            "layers",
          ],
        });
      } catch (first) {
        try {
          session = await xr.requestSession("immersive-vr");
        } catch (second) {
          throw second ?? first;
        }
      }

      session.addEventListener("end", this.onEndBound);

      try {
        await this.renderer.xr.setSession(session);
      } catch (e) {
        this.set({ state: "error", error: String(e) });
        try {
          await session.end();
        } catch {
          /* */
        }
        return false;
      }

      let refType: "local-floor" | "local" = "local";
      try {
        await session.requestReferenceSpace("local-floor");
        refType = "local-floor";
      } catch {
        try {
          await session.requestReferenceSpace("local");
          refType = "local";
        } catch {
          /* best effort */
        }
      }

      try {
        this.renderer.xr.setReferenceSpaceType(refType);
      } catch {
        /* three applies this internally when possible */
      }

      try {
        if (typeof this.renderer.xr.setFoveation === "function") {
          this.renderer.xr.setFoveation(1);
        }
      } catch {
        /* optional */
      }

      this.set({
        state: "presenting",
        session,
        referenceSpaceType: refType,
        error: null,
      });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.set({ state: "error", error: msg, session: null });
      const still = await probeImmersiveVR();
      this.set({
        state: still ? "available" : "unsupported",
        error: msg,
        session: null,
      });
      return false;
    }
  }

  async end(): Promise<void> {
    if (!this.info.session) {
      this.set({
        state: getCapabilities().immersiveVR ? "available" : "unsupported",
        session: null,
      });
      return;
    }
    this.set({ state: "ending" });
    try {
      await this.info.session.end();
    } catch {
      /* already ended */
    }
  }

  private onSessionEnd() {
    const session = this.info.session;
    if (session) {
      try {
        session.removeEventListener("end", this.onEndBound);
      } catch {
        /* */
      }
    }
    this.set({
      state: getCapabilities().immersiveVR ? "available" : "unsupported",
      session: null,
      referenceSpaceType: "none",
      error: null,
    });
  }

  dispose() {
    void this.end();
    this.listeners.clear();
  }
}
