'use client';

/**
 * The small tones and haptic taps that go with a reward (the "Sound and haptics" preference). Tones are synthesized (a few
 * sine notes at a low gain, no audio files); haptics use the Vibration API where the device has one (Android; iOS Safari has
 * none). Everything is best effort: a browser that blocks audio until a gesture simply stays silent.
 */

type Cue = 'xp' | 'level' | 'phase' | 'achievement' | 'boss' | 'streak';

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    }
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

/** [frequency in Hz, start offset in s, length in s] */
const TONES: Record<Cue, [number, number, number][]> = {
  xp: [[784, 0, 0.09]],
  streak: [
    [659, 0, 0.08],
    [880, 0.08, 0.1],
  ],
  level: [
    [523, 0, 0.1],
    [659, 0.1, 0.1],
    [784, 0.2, 0.16],
  ],
  phase: [
    [523, 0, 0.1],
    [659, 0.1, 0.1],
    [784, 0.2, 0.1],
    [1047, 0.3, 0.2],
  ],
  achievement: [
    [659, 0, 0.1],
    [784, 0.1, 0.1],
    [988, 0.2, 0.22],
  ],
  boss: [
    [392, 0, 0.12],
    [523, 0.12, 0.12],
    [659, 0.24, 0.12],
    [784, 0.36, 0.12],
    [1047, 0.48, 0.3],
  ],
};

const HAPTICS: Record<Cue, number | number[]> = {
  xp: 10,
  streak: [10, 40, 10],
  level: [14, 50, 14],
  phase: [14, 50, 14, 50, 22],
  achievement: [14, 50, 22],
  boss: [20, 60, 20, 60, 40],
};

export function celebrate(cue: Cue): void {
  const ctx = audio();
  if (ctx) {
    const now = ctx.currentTime;
    for (const [freq, offset, length] of TONES[cue]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.06, now + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + length);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + length + 0.02);
    }
  }
  try {
    navigator.vibrate?.(HAPTICS[cue]);
  } catch {
    /* no haptics here */
  }
}
