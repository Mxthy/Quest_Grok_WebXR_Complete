# Quest 3 WebXR — KB-aligned build

## Knowledge domains used

| KB slug | Rule applied |
|---------|----------------|
| `life-vibe/architecture/platform-adapters` | Simulation is the game; WebXR is a client. Gameplay never imports raw XR APIs. |
| `life-vibe/webxr/iwsdk` | Meta WebXR path + feature detection + Three.js renderer; XR behind adapter. |
| `life-vibe/threejs/webgl2-xr` | `renderer.xr` / `setAnimationLoop`; sim state outside scene objects. |
| `life-vibe/performance/quest3-budgets` | Target **72 FPS** first (~13.9 ms); measure on device. |
| `web-xr/.../vr-controllers-locomotion-teleport` | Controller rays, local-floor, snap/teleport for comfort. |
| `assets-vrm/.../vrm-three-vrm-bone-mapping` | Normalized bones for zone anchors; `vrm.update(delta)`. |
| `assets-vrm/.../vrm0-gltf-optimization-danger` | Do not gltfpack/Draco VRM blindly. |
| `deploy-hosting/.../cloudflare-pages-nitro-webxr` | HTTPS mandatory; Pages 25 MB/file for VRM. |

## Boundary

```
Desktop Input / Touch / WebXRClient
              │
         ActionState only
              │
         game/engine (simulation)
              │
     store · zones · vivi · apartment
```

- **Allowed in `engine.ts`:** `@/clients/webxr` facade + `@/xr/InputActions` types.
- **Forbidden in gameplay:** `XRSession`, `renderer.xr.getController`, raw gamepad XR paths.
- **Client owns:** session, controllers, locomotion, haptics, world prompts, diagnostics.

## Package truth

Repository `three` version is the only renderer truth (see `package.json`). Do not invent XR package versions.

## Deploy (HTTPS)

WebXR requires a secure context. Preferred stack per KB: Cloudflare Pages (TLS at edge). Heavy VRM/GLB: compress or R2 if over Pages per-file limit (25 MB).

```bash
npm install
npm run xr:smoke
npm run typecheck
npm run build
# host dist over HTTPS → Quest Browser → Enter VR
```

## Controls (Quest)

| Input | ActionState |
|-------|-------------|
| Left stick | move |
| Right stick X | turn (snap default) |
| Right stick Y hold / release | teleport aim / confirm |
| Trigger | interact |
| Grip | grab |
| A | photo |
| B | menu |
| Y | inventory |

## Validation evidence

- Static: `npm run xr:smoke` (files + engine must not import raw XR modules).
- Device: physical Quest 3, OVR Metrics / sustained frame time — **not claimed without run**.
