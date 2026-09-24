export { XRSessionManager, type XRSessionInfo, type XRSessionState } from "@/xr/XRSessionManager";
export { XRPlayerRig } from "@/xr/XRPlayerRig";
export { QuestControllerLayer } from "@/xr/QuestControllerLayer";
export { LocomotionSystem } from "@/xr/Locomotion";
export { XRDiagnostics, type XRDiagSnapshot } from "@/xr/XRDiagnostics";
export {
  loadComfort,
  saveComfort,
  updateComfort,
  DEFAULT_COMFORT,
  type VRComfortConfig,
} from "@/xr/VRComfortSettings";
export {
  emptyActions,
  mergeActions,
  type ActionState,
  type InputAction,
} from "@/xr/InputActions";
export { HandTrackingProvider, type XRInputProvider } from "@/xr/XRInputProvider";
export { VRHudSystem } from "@/xr/VRHudSystem";
export { ComfortVignette } from "@/xr/ComfortVignette";
export { QUEST_TARGET_FPS, applyQuestRendererProfile } from "@/xr/QuestPerformance";
