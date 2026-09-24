/**
 * Public client surface for WebXR — gameplay imports only from here.
 * KB: life-vibe/architecture/platform-adapters
 */
export {
  createWebXRClient,
  QUEST_TARGET_FPS,
  QUEST_FRAME_BUDGET_MS,
  type WebXRClient,
  type WebXRFrameResult,
} from "@/clients/webxr/WebXRClient";
