/**
 * Spatial presence audio — listener on camera, sources at Vivi head / feet.
 * Procedural micro-SFX (footsteps, cloth) so we don't depend on extra assets.
 */
let ctx: AudioContext | null = null;
let listener: AudioListener | null = null;

type Source = {
  panner: PannerNode;
  gain: GainNode;
  connected: boolean;
};

const sources: Record<string, Source> = {};
let footCooldown = 0;
let clothCooldown = 0;
let lastProx = 0;

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      listener = ctx.listener;
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function ensureSource(id: string, refDistance = 0.8, maxDistance = 6): Source | null {
  const c = ac();
  if (!c) return null;
  if (sources[id]) return sources[id];
  const panner = c.createPanner();
  panner.panningModel = "HRTF";
  panner.distanceModel = "inverse";
  panner.refDistance = refDistance;
  panner.maxDistance = maxDistance;
  panner.rolloffFactor = 1.2;
  panner.coneInnerAngle = 360;
  panner.coneOuterAngle = 360;
  const gain = c.createGain();
  gain.gain.value = 0.0001;
  panner.connect(gain);
  gain.connect(c.destination);
  const s = { panner, gain, connected: true };
  sources[id] = s;
  return s;
}

/** Call each frame with camera world matrix / position + orientation */
export function updateAudioListener(
  pos: { x: number; y: number; z: number },
  forward: { x: number; y: number; z: number },
  up: { x: number; y: number; z: number } = { x: 0, y: 1, z: 0 },
) {
  const c = ac();
  if (!c || !listener) return;
  const t = c.currentTime;
  if (listener.positionX) {
    listener.positionX.setValueAtTime(pos.x, t);
    listener.positionY.setValueAtTime(pos.y, t);
    listener.positionZ.setValueAtTime(pos.z, t);
    listener.forwardX.setValueAtTime(forward.x, t);
    listener.forwardY.setValueAtTime(forward.y, t);
    listener.forwardZ.setValueAtTime(forward.z, t);
    listener.upX.setValueAtTime(up.x, t);
    listener.upY.setValueAtTime(up.y, t);
    listener.upZ.setValueAtTime(up.z, t);
  } else {
    // legacy
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const l = listener as any;
    l.setPosition?.(pos.x, pos.y, pos.z);
    l.setOrientation?.(forward.x, forward.y, forward.z, up.x, up.y, up.z);
  }
}

export function setSourcePosition(id: string, x: number, y: number, z: number) {
  const s = ensureSource(id);
  if (!s || !ctx) return;
  const t = ctx.currentTime;
  if (s.panner.positionX) {
    s.panner.positionX.setValueAtTime(x, t);
    s.panner.positionY.setValueAtTime(y, t);
    s.panner.positionZ.setValueAtTime(z, t);
  } else {
    s.panner.setPosition(x, y, z);
  }
}

function burstNoise(
  panner: PannerNode,
  opts: { duration: number; volume: number; freq?: number; type?: OscillatorType },
) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  const f = c.createBiquadFilter();
  osc.type = opts.type ?? "triangle";
  osc.frequency.value = opts.freq ?? 180;
  f.type = "bandpass";
  f.frequency.value = opts.freq ?? 200;
  f.Q.value = 0.8;
  g.gain.value = 0.0001;
  osc.connect(f);
  f.connect(g);
  g.connect(panner);
  g.gain.linearRampToValueAtTime(opts.volume, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration);
  osc.start(t0);
  osc.stop(t0 + opts.duration + 0.02);
}

/** Soft giggle / voice bed toward head — spatial */
export function playSpatialVoice(volume = 0.04) {
  const s = ensureSource("vivi_head", 0.6, 5);
  if (!s) return;
  burstNoise(s.panner, { duration: 0.22, volume, freq: 420, type: "sine" });
  setTimeout(() => {
    burstNoise(s.panner, { duration: 0.18, volume: volume * 0.7, freq: 380, type: "sine" });
  }, 80);
}

export function playSpatialGiggle() {
  playSpatialVoice(0.045);
}

/** Footsteps when Vivi or player moves */
export function tickFootsteps(input: {
  dt: number;
  moving: boolean;
  isPlayer?: boolean;
  surface?: "wood" | "soft";
}) {
  if (!input.moving) return;
  footCooldown -= input.dt;
  if (footCooldown > 0) return;
  footCooldown = input.isPlayer ? 0.38 : 0.42;
  const id = input.isPlayer ? "player_feet" : "vivi_feet";
  const s = ensureSource(id, 0.5, 4);
  if (!s) return;
  const soft = input.surface === "soft";
  burstNoise(s.panner, {
    duration: soft ? 0.08 : 0.06,
    volume: soft ? 0.012 : 0.018,
    freq: soft ? 120 : 160 + Math.random() * 40,
    type: "triangle",
  });
}

/** Cloth rustle when proximity changes quickly or she turns */
export function tickCloth(input: {
  dt: number;
  proximity: number;
  turning?: boolean;
  moving?: boolean;
}) {
  clothCooldown -= input.dt;
  const dProx = Math.abs(input.proximity - lastProx);
  lastProx = input.proximity;
  if (clothCooldown > 0) return;
  if (dProx < 0.04 && !input.turning && !input.moving) return;
  clothCooldown = 0.55 + Math.random() * 0.4;
  const s = ensureSource("vivi_cloth", 0.7, 4);
  if (!s) return;
  burstNoise(s.panner, {
    duration: 0.12,
    volume: 0.01 + input.proximity * 0.015,
    freq: 600 + Math.random() * 200,
    type: "sawtooth",
  });
}

/** Heart-adjacent soft pulse at high proximity + consent */
export function tickClosePulse(input: { dt: number; proximity: number; consent: boolean }) {
  if (!input.consent || input.proximity < 0.82) return;
  // reuse foot cooldown channel lightly
  const s = ensureSource("vivi_head", 0.5, 3);
  if (!s || !ctx) return;
  // very quiet ongoing — handled by presence bed; occasional tick
  if (Math.random() > input.dt * 0.35) return;
  burstNoise(s.panner, {
    duration: 0.15,
    volume: 0.008 * input.proximity,
    freq: 70,
    type: "sine",
  });
}

export function disposeSpatialAudio() {
  for (const s of Object.values(sources)) {
    try {
      s.panner.disconnect();
      s.gain.disconnect();
    } catch {
      /* */
    }
  }
  for (const k of Object.keys(sources)) delete sources[k];
  try {
    void ctx?.close();
  } catch {
    /* */
  }
  ctx = null;
  listener = null;
}
