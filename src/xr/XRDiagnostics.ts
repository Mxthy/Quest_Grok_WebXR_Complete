/**
 * In-VR / on-screen diagnostics for Quest testing without a console.
 */
export type XRDiagSnapshot = {
  xrSession: string;
  referenceSpace: string;
  leftController: string;
  rightController: string;
  trigger: string;
  grip: string;
  thumbstick: string;
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  vrm: string;
  audio: string;
  presenting: boolean;
};

export class XRDiagnostics {
  private frames = 0;
  private acc = 0;
  private fps = 0;
  private frameMs = 0;
  private last = performance.now();
  visible = false;

  tick(dt: number) {
    this.frames++;
    this.acc += dt;
    this.frameMs = dt * 1000;
    if (this.acc >= 0.5) {
      this.fps = Math.round(this.frames / this.acc);
      this.frames = 0;
      this.acc = 0;
    }
  }

  toggle() {
    this.visible = !this.visible;
  }

  snapshot(partial: Partial<XRDiagSnapshot>): XRDiagSnapshot {
    return {
      xrSession: "—",
      referenceSpace: "—",
      leftController: "—",
      rightController: "—",
      trigger: "—",
      grip: "—",
      thumbstick: "—",
      fps: this.fps,
      frameMs: Math.round(this.frameMs * 10) / 10,
      drawCalls: 0,
      triangles: 0,
      vrm: "—",
      audio: "—",
      presenting: false,
      ...partial,
    };
  }
}
