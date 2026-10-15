/**
 * Focus soundscapes, synthesised live with the Web Audio API (no audio files, works offline).
 *
 * Honest note: the research on binaural beats is mixed (a 2018 meta-analysis found a small-to-medium
 * benefit, a 2023 one found mixed results for attention/memory). These are calming focus aids, not
 * a guaranteed brain boost. Binaural presets need stereo headphones.
 */

export type SoundscapeId = 'off' | 'om' | 'alpha' | 'theta' | 'gamma' | 'calm432';

export interface SoundscapeInfo {
  id: SoundscapeId;
  label: string;
  emoji: string;
  hint: string;
  headphones?: boolean;
}

export const SOUNDSCAPES: SoundscapeInfo[] = [
  { id: 'off', label: 'Silence', emoji: '🔇', hint: 'No background sound' },
  { id: 'om', label: 'Om drone', emoji: '🕉️', hint: 'Deep 136.1 Hz "Om" tone with a soft fifth. Grounding.' },
  { id: 'alpha', label: 'Calm focus', emoji: '🪷', hint: '10 Hz alpha binaural beat. Relaxed alertness.', headphones: true },
  { id: 'theta', label: 'Deep theta', emoji: '🌙', hint: '6 Hz theta binaural beat. Slow, meditative.', headphones: true },
  { id: 'gamma', label: 'Gamma spark', emoji: '⚡', hint: '40 Hz binaural beat. Bright, high-frequency focus.', headphones: true },
  { id: 'calm432', label: '432 Hz pad', emoji: '🔔', hint: 'Warm 432 Hz pad with gentle shimmer. Works on speakers.' },
];

interface Engine {
  ctx: AudioContext;
  master: GainNode;
  nodes: AudioNode[];
  stops: (() => void)[];
}

let engine: Engine | null = null;
let current: SoundscapeId = 'off';
let volume = 0.5;

const MAX_GAIN = 0.35;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

function osc(ctx: AudioContext, freq: number, type: OscillatorType, dest: AudioNode, gain: number, pan?: number) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = gain;
  o.connect(g);
  if (pan !== undefined && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    p.connect(dest);
  } else {
    g.connect(dest);
  }
  o.start();
  return { o, g };
}

/** Slow LFO that gently breathes a gain node's value. */
function breathe(ctx: AudioContext, target: AudioParam, rate: number, depth: number) {
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rate;
  const lg = ctx.createGain();
  lg.gain.value = depth;
  lfo.connect(lg);
  lg.connect(target);
  lfo.start();
  return lfo;
}

function softNoise(ctx: AudioContext, dest: AudioNode, level: number) {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; // brown-ish noise
      d[i] = last * 3.5;
    }
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 600;
  const g = ctx.createGain();
  g.gain.value = level;
  src.connect(lp);
  lp.connect(g);
  g.connect(dest);
  src.start();
  return src;
}

function build(id: SoundscapeId, e: Engine) {
  const { ctx, master } = e;
  const add = (n: OscillatorNode | AudioBufferSourceNode) => e.stops.push(() => { try { n.stop(); } catch { /* already stopped */ } });
  const binaural = (carrier: number, beat: number, noise: number) => {
    const l = osc(ctx, carrier, 'sine', master, 0.5, -1);
    const r = osc(ctx, carrier + beat, 'sine', master, 0.5, 1);
    add(l.o); add(r.o);
    add(softNoise(ctx, master, noise));
  };
  if (id === 'om') {
    const base = 136.1;
    [[base, 0.5], [base * 2, 0.22], [base * 1.5, 0.18], [base * 3, 0.06]].forEach(([f, g], i) => {
      const { o, g: gn } = osc(ctx, f, 'sine', master, g);
      add(o);
      add(breathe(ctx, gn.gain, 0.07 + i * 0.02, g * 0.35));
    });
  } else if (id === 'alpha') binaural(200, 10, 0.25);
  else if (id === 'theta') binaural(180, 6, 0.3);
  else if (id === 'gamma') binaural(400, 40, 0.15);
  else if (id === 'calm432') {
    [[432, 0.4], [432 * 2, 0.15], [432 * 1.5, 0.12], [216, 0.25]].forEach(([f, g], i) => {
      const { o, g: gn } = osc(ctx, f + (i % 2 ? 0.4 : -0.4), 'sine', master, g);
      add(o);
      add(breathe(ctx, gn.gain, 0.1 + i * 0.03, g * 0.4));
    });
    add(softNoise(ctx, master, 0.12));
  }
}

function teardown() {
  if (!engine) return;
  const old = engine;
  engine = null;
  old.master.gain.cancelScheduledValues(old.ctx.currentTime);
  old.master.gain.setTargetAtTime(0, old.ctx.currentTime, 0.25);
  setTimeout(() => {
    old.stops.forEach((s) => s());
    old.ctx.close().catch(() => undefined);
  }, 900);
}

/** Must be called from a user gesture the first time (browser autoplay policy). */
export function playSoundscape(id: SoundscapeId) {
  if (id === current && engine) return;
  teardown();
  current = id;
  if (id === 'off') return;
  const ctx = getCtx();
  if (!ctx) return;
  ctx.resume().catch(() => undefined);
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  engine = { ctx, master, nodes: [], stops: [] };
  build(id, engine);
  master.gain.setTargetAtTime(volume * MAX_GAIN, ctx.currentTime, 1.2); // slow fade-in
}

export function stopSoundscape() {
  current = 'off';
  teardown();
}

export function setSoundscapeVolume(v: number) {
  volume = Math.min(1, Math.max(0, v));
  if (engine) engine.master.gain.setTargetAtTime(volume * MAX_GAIN, engine.ctx.currentTime, 0.1);
}

export function isSoundscapePlaying() {
  return !!engine;
}

/** Little UI chime (pentatonic) for correct answers / completion. */
export function playChime(kind: 'good' | 'soft' | 'finish', vol = 0.5) {
  const ctx = getCtx();
  if (!ctx) return;
  const seq = kind === 'finish' ? [523.25, 659.25, 783.99, 1046.5] : kind === 'good' ? [659.25, 880] : [392, 440];
  seq.forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const t = ctx.currentTime + i * 0.13;
    o.type = 'triangle';
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18 * vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.75);
  });
  setTimeout(() => ctx.close().catch(() => undefined), 1800);
}
