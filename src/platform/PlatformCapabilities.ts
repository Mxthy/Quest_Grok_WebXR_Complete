/**
 * Capability detection — never assume a feature exists.
 */

export type PlatformKind = "desktop" | "android" | "ios" | "quest" | "unknown";

export type PlatformCapabilities = {
  platform: PlatformKind;
  touch: boolean;
  webxr: boolean;
  immersiveVR: boolean;
  /** resolved after async check */
  immersiveVRChecked: boolean;
  controllers: boolean;
  handTracking: boolean;
  gamepad: boolean;
  microphone: boolean;
  camera: boolean;
  isSecureContext: boolean;
  userAgent: string;
};

let cached: PlatformCapabilities | null = null;
let immersivePromise: Promise<boolean> | null = null;

function detectPlatform(): PlatformKind {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/OculusBrowser|Quest/i.test(ua)) return "quest";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Windows|Macintosh|Linux/i.test(ua) && !/Mobile/i.test(ua)) return "desktop";
  return "unknown";
}

export function getCapabilities(): PlatformCapabilities {
  if (cached) return cached;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const platform = detectPlatform();
  const touch =
    typeof window !== "undefined" &&
    ("ontouchstart" in window || (navigator.maxTouchPoints ?? 0) > 0);
  const webxr = typeof navigator !== "undefined" && !!(navigator as Navigator & { xr?: unknown }).xr;
  const gamepad = typeof navigator !== "undefined" && "getGamepads" in navigator;
  cached = {
    platform,
    touch,
    webxr,
    immersiveVR: false,
    immersiveVRChecked: false,
    controllers: platform === "quest" || webxr,
    handTracking: false,
    gamepad,
    microphone: typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    camera: typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    isSecureContext: typeof window !== "undefined" ? window.isSecureContext : false,
    userAgent: ua,
  };
  return cached;
}

/** Async immersive-vr support probe */
export async function probeImmersiveVR(): Promise<boolean> {
  if (immersivePromise) return immersivePromise;
  immersivePromise = (async () => {
    const caps = getCapabilities();
    try {
      const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
      if (!xr?.isSessionSupported) {
        caps.immersiveVR = false;
        caps.immersiveVRChecked = true;
        return false;
      }
      const ok = await xr.isSessionSupported("immersive-vr");
      caps.immersiveVR = ok;
      caps.immersiveVRChecked = true;
      return ok;
    } catch {
      caps.immersiveVR = false;
      caps.immersiveVRChecked = true;
      return false;
    }
  })();
  return immersivePromise;
}

export function isQuestBrowser(): boolean {
  return getCapabilities().platform === "quest";
}
