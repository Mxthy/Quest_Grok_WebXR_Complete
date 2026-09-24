#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));

const dialogues = read("src/data/dialogues.json");
const interactables = read("src/data/interactables.json");
const items = read("src/data/items.json");
const recipes = read("src/data/recipes.json");
const zones = read("src/data/zones.json");
const storeSrc = fs.readFileSync(path.join(root, "src/stores/gameStore.ts"), "utf8");
const vrm = path.join(root, "public/vrm/vivi.vrm");

const nodeCount = Object.keys(dialogues.nodes ?? {}).length;
const checks = [
  ["dialogues>=50", nodeCount >= 50, nodeCount],
  ["interactables>=20", interactables.length >= 20, interactables.length],
  ["decor>=12", items.decor.length >= 12, items.decor.length],
  ["shop>=8", items.shop.length >= 8, items.shop.length],
  ["recipes>=3", recipes.length >= 3, recipes.length],
  ["zones>=5", zones.length >= 5, zones.length],
  ["save key", storeSrc.includes("quest-companion-apartment-alpha"), "quest-companion-apartment-alpha"],
  ["Vivi model", fs.existsSync(vrm) && fs.statSync(vrm).size > 1000, fs.existsSync(vrm) ? fs.statSync(vrm).size : 0],
];

let ok = true;
for (const [name, pass, detail] of checks) {
  console.log(`${pass ? "OK" : "FAIL"}  ${name}  (${detail})`);
  if (!pass) ok = false;
}
if (!ok) process.exit(1);
console.log("alpha content gate passed");
