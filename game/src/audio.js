// audio.js — original sound effects, synthesized with WebAudio.
// No audio files, no network: every sound is an oscillator or filtered
// noise shaped in code. The context is created lazily on the first user
// gesture (browsers block audio before that) and M toggles mute.
let context = null;
let muted = false;
let sizzleNodes = null;

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  if (sizzleNodes) stopSizzle();
  return muted;
}

export function unlock() {
  if (!context) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
    } catch (error) {
      context = null;
    }
  }
  if (context && context.state === 'suspended') {
    context.resume().catch(() => {});
  }
}

function tone(freq, duration, type, volume, slideTo) {
  if (!context || muted) return;
  try {
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    gain.gain.setValueAtTime(volume || 0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  } catch (error) {
    // Sound is garnish: never let it break the game.
  }
}

function noiseBurst(duration, filterFreq, volume) {
  if (!context || muted) return;
  try {
    const now = context.currentTime;
    const length = Math.floor(context.sampleRate * duration);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq || 1200;
    filter.Q.value = 0.8;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume || 0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    source.start(now);
  } catch (error) {
    // Sound is garnish: never let it break the game.
  }
}

export function sfxClick() {
  tone(660, 0.07, 'triangle', 0.12);
}

export function sfxAdd() {
  tone(520, 0.08, 'sine', 0.14, 780);
}

export function sfxTossPerfect() {
  tone(880, 0.12, 'sine', 0.18, 1320);
  noiseBurst(0.25, 900, 0.25);
  setTimeout(() => tone(1320, 0.15, 'sine', 0.12, 1760), 90);
}

export function sfxTossGood() {
  tone(740, 0.1, 'sine', 0.14, 990);
}

export function sfxTossMiss() {
  tone(220, 0.12, 'sawtooth', 0.07, 160);
}

export function sfxServe() {
  tone(784, 0.12, 'sine', 0.16);
  setTimeout(() => tone(1046, 0.2, 'sine', 0.16), 110);
}

export function sfxError() {
  tone(180, 0.18, 'square', 0.08, 120);
}

export function sfxBurnt() {
  noiseBurst(0.4, 300, 0.2);
  tone(140, 0.3, 'sawtooth', 0.08, 90);
}

export function sfxTicket() {
  tone(988, 0.09, 'triangle', 0.1);
  setTimeout(() => tone(1175, 0.09, 'triangle', 0.1), 90);
}

export function startSizzle() {
  if (!context || muted || sizzleNodes) return;
  try {
    const length = context.sampleRate;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2500;
    const gain = context.createGain();
    gain.gain.value = 0.05;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    source.start();
    sizzleNodes = { source, gain };
  } catch (error) {
    sizzleNodes = null;
  }
}

export function stopSizzle() {
  if (!sizzleNodes) return;
  try {
    sizzleNodes.source.stop();
  } catch (error) {
    // Already stopped.
  }
  sizzleNodes = null;
}
