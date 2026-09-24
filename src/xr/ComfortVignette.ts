/**
 * Peripheral comfort vignette (tunneling) while locomoting.
 * KB: xr-interaction/locomotion-comfort — blend 0.1–0.3 s, hide when still.
 */
import * as THREE from "three";

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uIntensity;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float d = length(p);
  float edge = smoothstep(0.42, 1.15, d);
  float a = edge * uIntensity * 0.82;
  gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}
`;

export class ComfortVignette {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private intensity = 0;
  private target = 0;

  constructor(camera: THREE.Camera) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uIntensity: { value: 0 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const geo = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9999;
    this.mesh.name = "ComfortVignette";
    this.mesh.visible = false;
    camera.add(this.mesh);
    this.mesh.position.set(0, 0, -0.15);
  }

  setMoving(moving: boolean, enabled: boolean) {
    this.target = enabled && moving ? 1 : 0;
    this.mesh.visible = enabled;
  }

  update(dt: number) {
    const k = this.target > this.intensity ? 8 : 5; // ~0.12–0.2 s
    this.intensity += (this.target - this.intensity) * Math.min(1, dt * k);
    this.mat.uniforms.uIntensity.value = this.intensity;
    this.mesh.visible = this.intensity > 0.01;
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
