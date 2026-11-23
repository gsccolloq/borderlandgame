import { Howl, Howler } from 'howler';

/**
 * Generates an in-memory 16-bit mono PCM WAV Blob URL so Howler.js plays
 * multi-layer industrial audio with zero external network dependencies.
 */
function encodeWavBlobUrl(samples: Float32Array, sampleRate = 22050): string {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

function buildDroneBuffer(sr = 22050): Float32Array {
  const duration = 3.0;
  const len = Math.floor(sr * duration);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const lfo = 0.72 + 0.28 * Math.sin((2 * Math.PI * t) / duration);
    const sub = Math.sin(2 * Math.PI * 52 * t) * 0.4;
    const fifth = Math.sin(2 * Math.PI * 78 * t) * 0.2;
    const grit = Math.sin(2 * Math.PI * 104.5 * t) * 0.08;
    out[i] = (sub + fifth + grit) * lfo * 0.45;
  }
  return out;
}

function buildHeartbeatBuffer(sr = 22050): Float32Array {
  const duration = 0.95;
  const len = Math.floor(sr * duration);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    let v = 0;
    if (t < 0.14) {
      const env = Math.sin((t / 0.14) * Math.PI) * Math.exp(-t * 14);
      v += Math.sin(2 * Math.PI * (65 - t * 140) * t) * env;
    }
    if (t >= 0.22 && t < 0.36) {
      const dt = t - 0.22;
      const env = Math.sin((dt / 0.14) * Math.PI) * Math.exp(-dt * 18);
      v += Math.sin(2 * Math.PI * (58 - dt * 120) * dt) * env * 0.75;
    }
    out[i] = v * 0.8;
  }
  return out;
}

function buildLaserBuffer(sr = 22050): Float32Array {
  const duration = 0.9;
  const len = Math.floor(sr * duration);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const freq = 1400 * Math.exp(-t * 5.2) + 75;
    const env = t < 0.04 ? t / 0.04 : Math.exp(-(t - 0.04) * 3.4);
    const noise = (Math.random() * 2 - 1) * Math.exp(-t * 6) * 0.32;
    const beam = Math.sin(2 * Math.PI * freq * t) * 0.68 + Math.sin(2 * Math.PI * freq * 1.5 * t) * 0.22;
    out[i] = (beam + noise) * env * 0.8;
  }
  return out;
}

function buildLockToneBuffer(sr = 22050, freqStart = 540, freqEnd = 780, duration = 0.14): Float32Array {
  const len = Math.floor(sr * duration);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const ratio = t / duration;
    const freq = freqStart + (freqEnd - freqStart) * ratio;
    const env = Math.sin(ratio * Math.PI);
    out[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.45;
  }
  return out;
}

function buildShatterBuffer(sr = 22050): Float32Array {
  const duration = 0.65;
  const len = Math.floor(sr * duration);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 6.5);
    const noise = (Math.random() * 2 - 1) * 0.7;
    const ring = Math.sin(2 * Math.PI * 2450 * t) * 0.22 + Math.sin(2 * Math.PI * 3710 * t) * 0.18;
    out[i] = (noise + ring) * env * 0.75;
  }
  return out;
}

class BorderlandAudioEngine {
  private initialized = false;
  private enabled = true;
  private drone: Howl | null = null;
  private heartbeat: Howl | null = null;
  private laser: Howl | null = null;
  private lockSfx: Howl | null = null;
  private correctSfx: Howl | null = null;
  private damageSfx: Howl | null = null;
  private shatterSfx: Howl | null = null;
  private dronePlaying = false;
  private heartbeatPlaying = false;

  public init(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    this.drone = new Howl({
      src: [encodeWavBlobUrl(buildDroneBuffer())],
      format: ['wav'],
      loop: true,
      volume: 0.24,
    });

    this.heartbeat = new Howl({
      src: [encodeWavBlobUrl(buildHeartbeatBuffer())],
      format: ['wav'],
      loop: true,
      volume: 0.4,
    });

    this.laser = new Howl({
      src: [encodeWavBlobUrl(buildLaserBuffer())],
      format: ['wav'],
      volume: 0.65,
    });

    this.lockSfx = new Howl({
      src: [encodeWavBlobUrl(buildLockToneBuffer(22050, 480, 720, 0.12))],
      format: ['wav'],
      volume: 0.4,
    });

    this.correctSfx = new Howl({
      src: [encodeWavBlobUrl(buildLockToneBuffer(22050, 520, 1040, 0.22))],
      format: ['wav'],
      volume: 0.45,
    });

    this.damageSfx = new Howl({
      src: [encodeWavBlobUrl(buildLockToneBuffer(22050, 260, 110, 0.28))],
      format: ['wav'],
      volume: 0.55,
    });

    this.shatterSfx = new Howl({
      src: [encodeWavBlobUrl(buildShatterBuffer())],
      format: ['wav'],
      volume: 0.7,
    });
  }

  public setEnabled(next: boolean): void {
    this.enabled = next;
    Howler.mute(!next);
    if (!next) {
      this.stopHeartbeat();
      this.stopDrone();
    }
  }

  public startDrone(): void {
    if (!this.enabled) return;
    this.init();
    if (this.drone && !this.dronePlaying) {
      this.dronePlaying = true;
      this.drone.play();
    }
  }

  public stopDrone(): void {
    if (this.drone && this.dronePlaying) {
      this.drone.stop();
      this.dronePlaying = false;
    }
  }

  public setHeartbeatIntensity(intensity: number): void {
    if (!this.enabled) {
      this.stopHeartbeat();
      return;
    }
    this.init();
    if (!this.heartbeat) return;

    if (intensity <= 0.05) {
      this.stopHeartbeat();
      return;
    }

    const rate = 1.0 + Math.min(1, intensity) * 0.85;
    const vol = 0.22 + Math.min(1, intensity) * 0.42;
    this.heartbeat.rate(rate);
    this.heartbeat.volume(vol);

    if (!this.heartbeatPlaying) {
      this.heartbeatPlaying = true;
      this.heartbeat.play();
    }
  }

  public stopHeartbeat(): void {
    if (this.heartbeat && this.heartbeatPlaying) {
      this.heartbeat.stop();
      this.heartbeatPlaying = false;
    }
  }

  public playLock(): void {
    if (!this.enabled) return;
    this.init();
    this.lockSfx?.play();
  }

  public playCorrect(): void {
    if (!this.enabled) return;
    this.init();
    this.correctSfx?.play();
  }

  public playDamage(): void {
    if (!this.enabled) return;
    this.init();
    this.damageSfx?.play();
  }

  public playLaser(): void {
    if (!this.enabled) return;
    this.init();
    this.laser?.play();
  }

  public playShatter(): void {
    if (!this.enabled) return;
    this.init();
    this.shatterSfx?.play();
  }
}

export const audioEngine = new BorderlandAudioEngine();

export function speakDealerLine(text: string, voiceEnabled: boolean): void {
  if (!voiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  if (!text.trim()) return;

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const viVoice = voices.find((v) => v.lang.toLowerCase().startsWith('vi'));
    const enVoice = voices.find((v) => v.lang.toLowerCase().startsWith('en'));
    if (viVoice) {
      utterance.voice = viVoice;
      utterance.lang = viVoice.lang;
    } else if (enVoice) {
      utterance.voice = enVoice;
      utterance.lang = enVoice.lang;
    } else {
      utterance.lang = 'vi-VN';
    }
    // Cold, detached Dealer cadence
    utterance.pitch = 0.76;
    utterance.rate = 0.98;
    utterance.volume = 0.85;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Ignore speech synthesis autoplay restrictions gracefully
  }
}

export function triggerHaptic(pattern: 'tap' | 'warning' | 'laser' | 'shatter'): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    if (pattern === 'tap') navigator.vibrate(20);
    else if (pattern === 'warning') navigator.vibrate([50, 40, 70]);
    else if (pattern === 'laser') navigator.vibrate([120, 40, 200]);
    else if (pattern === 'shatter') navigator.vibrate([80, 30, 80, 30, 240]);
  } catch {
    // Haptic API optional
  }
}
