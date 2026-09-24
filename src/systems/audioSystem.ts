import { Howl, Howler } from "howler";

let unlocked = false;

const sfx = {
  click: new Howl({ src: ["/audio/click.wav"], volume: 0.45 }),
  gift: new Howl({ src: ["/audio/gift.wav"], volume: 0.55 }),
  cook: new Howl({ src: ["/audio/cook.wav"], volume: 0.5 }),
  giggle: new Howl({ src: ["/audio/giggle.wav"], volume: 0.5 }),
};

const city = new Howl({
  src: ["/audio/city.wav"],
  loop: true,
  volume: 0.22,
});

let radioOsc: OscillatorNode | null = null;
let radioGain: GainNode | null = null;
let ctx: AudioContext | null = null;

/** Soft presence bed — very quiet filtered noise / tone */
let presenceOsc: OscillatorNode | null = null;
let presenceGain: GainNode | null = null;
let presenceFilter: BiquadFilterNode | null = null;
let proxCooldown = 0;

export function unlockAudio() {
  if (unlocked) {
    Howler.ctx?.resume();
    ensurePresenceBed();
    return;
  }
  unlocked = true;
  Howler.mute(false);
  if (Howler.ctx?.state === "suspended") Howler.ctx.resume();
  if (!city.playing()) city.play();
  ensurePresenceBed();
}

function ac(): AudioContext | null {
  try {
    ctx = ctx ?? new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function ensurePresenceBed() {
  const c = ac();
  if (!c || presenceOsc) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    const filter = c.createBiquadFilter();
    osc.type = "sine";
    osc.frequency.value = 110;
    filter.type = "lowpass";
    filter.frequency.value = 280;
    gain.gain.value = 0.0001;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    osc.start();
    presenceOsc = osc;
    presenceGain = gain;
    presenceFilter = filter;
  } catch {
    /* */
  }
}

export function playSfx(name: keyof typeof sfx) {
  const s = sfx[name];
  s.rate(0.94 + Math.random() * 0.12);
  s.play();
}

export function setAmbience(on: boolean, vol = 0.22) {
  city.volume(on ? vol : 0);
  if (on && !city.playing()) city.play();
  if (!on) city.pause();
}

/** Continuous immersion mix from director */
export function setImmersionMix(proximity: number, warmth01: number, night: boolean) {
  ensurePresenceBed();
  if (!presenceGain || !presenceFilter || !presenceOsc) return;
  const now = ctx?.currentTime ?? 0;
  // Closer → slightly more body in the bed, never loud
  const target = 0.002 + proximity * 0.012 * (0.5 + warmth01 * 0.5) * (night ? 0.85 : 1);
  presenceGain.gain.cancelScheduledValues(now);
  presenceGain.gain.linearRampToValueAtTime(target, now + 0.15);
  presenceFilter.frequency.linearRampToValueAtTime(220 + proximity * 180, now + 0.2);
  presenceOsc.frequency.linearRampToValueAtTime(98 + warmth01 * 40, now + 0.25);
}

/** Sparse soft tick when very close — not a metronome */
export function playProximityTone(proximity: number, dt: number) {
  proxCooldown -= dt;
  if (proxCooldown > 0 || proximity < 0.75) return;
  proxCooldown = 2.8 + Math.random() * 2.5;
  const c = ac();
  if (!c) return;
  try {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = 320 + proximity * 80;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(c.destination);
    const t0 = c.currentTime;
    g.gain.linearRampToValueAtTime(0.018 * proximity, t0 + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
    o.start(t0);
    o.stop(t0 + 0.5);
  } catch {
    /* */
  }
}

export function setRadio(on: boolean) {
  if (on) startRadio();
  else stopRadio();
}

function startRadio() {
  try {
    const c = ac();
    if (!c) return;
    stopRadio();
    const osc = c.createOscillator();
    const gain = c.createGain();
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    osc.type = "triangle";
    osc.frequency.value = 196;
    lfo.frequency.value = 0.35;
    lfoGain.gain.value = 12;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    lfo.start();
    radioOsc = osc;
    radioGain = gain;
  } catch {
    /* ignore */
  }
}

function stopRadio() {
  try {
    radioOsc?.stop();
  } catch {
    /* already stopped */
  }
  radioOsc?.disconnect();
  radioGain?.disconnect();
  radioOsc = null;
  radioGain = null;
}

export function disposeAudio() {
  stopRadio();
  try {
    presenceOsc?.stop();
  } catch {
    /* */
  }
  presenceOsc?.disconnect();
  presenceGain?.disconnect();
  presenceFilter?.disconnect();
  presenceOsc = null;
  presenceGain = null;
  presenceFilter = null;
  city.stop();
  Howler.unload();
}
