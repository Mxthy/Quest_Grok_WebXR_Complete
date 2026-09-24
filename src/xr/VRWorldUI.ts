/**
 * Minimal world-space UI planes for interaction prompts / dialogue title.
 * Uses canvas textures — no React dependency inside the render loop.
 */
import * as THREE from "three";

function makeLabelTexture(text: string, w = 512, h = 128): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(12,12,16,0.82)";
  roundRect(ctx, 8, 8, w - 16, h - 16, 16);
  ctx.fill();
  ctx.fillStyle = "#f4f4f5";
  ctx.font = "600 36px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = wrap(text, 28);
  lines.forEach((line, i) => {
    ctx.fillText(line, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 40);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function wrap(s: string, max: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class VRWorldUI {
  readonly group: THREE.Group;
  private mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private last = "";

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.group.name = "VRWorldUI";
    this.mat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.18), this.mat);
    this.group.add(this.mesh);
    this.group.visible = false;
    scene.add(this.group);
  }

  show(text: string, worldPos: THREE.Vector3, camera: THREE.Camera) {
    if (text !== this.last) {
      const old = this.mat.map;
      this.mat.map = makeLabelTexture(text);
      this.mat.needsUpdate = true;
      old?.dispose();
      this.last = text;
    }
    this.group.position.copy(worldPos);
    this.group.position.y += 0.15;
    this.group.lookAt(camera.position);
    this.group.visible = true;
  }

  hide() {
    this.group.visible = false;
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.mesh.geometry.dispose();
    this.mat.map?.dispose();
    this.mat.dispose();
  }
}
