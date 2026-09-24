import { readFileSync, existsSync } from "fs";
import { join } from "path";

const root = process.cwd();
let fail = 0;

function ok(msg) {
  console.log("OK", msg);
}
function bad(msg) {
  console.error("FAIL", msg);
  fail++;
}

const required = [
  "src/clients/webxr/WebXRClient.ts",
  "src/clients/webxr/index.ts",
  "src/xr/InputActions.ts",
  "src/xr/XRSessionManager.ts",
  "src/xr/QuestControllerLayer.ts",
  "src/xr/Locomotion.ts",
  "src/platform/PlatformCapabilities.ts",
  "QUEST-READY.md",
];
for (const f of required) {
  if (!existsSync(join(root, f))) bad("missing " + f);
  else ok(f);
}

const engine = readFileSync(join(root, "src/game/engine.ts"), "utf8");
if (!engine.includes('from "@/clients/webxr"')) bad("engine must import clients/webxr");
else ok("engine imports WebXR client facade");

const banned = [
  'from "@/xr/XRSessionManager"',
  'from "@/xr/QuestControllerLayer"',
  'from "@/xr/Locomotion"',
  'from "@/xr/XRPlayerRig"',
  'from "@/xr/VRWorldUI"',
  "navigator.xr.requestSession",
];
for (const b of banned) {
  if (engine.includes(b)) bad("engine still has raw XR: " + b);
  else ok("engine clean of " + b);
}

if (!engine.includes("createWebXRClient")) bad("engine missing createWebXRClient");
else ok("createWebXRClient used");

const client = readFileSync(join(root, "src/clients/webxr/WebXRClient.ts"), "utf8");
if (!client.includes("QUEST_TARGET_FPS = 72")) bad("missing 72 FPS budget constant");
else ok("QUEST_TARGET_FPS=72 (KB budget, not a device guarantee)");

console.log(fail ? `FAIL ${fail}` : "PASS kb-aligned smoke");
process.exit(fail ? 1 : 0);
