const MUTE_STORAGE_KEY = 'fsn_muted_v1';
const ATTACK_VOICE_URL = '/assets/aistudio/amitabh-bachchan-teri-maa-ka-vosda_6ac85be8.mp3';
const ENEMY_VOICE_URLS = [
  '/assets/aistudio/ReelAudio-96017_1926adaf.mp3',
  '/assets/aistudio/ReelAudio-75585_07fb3606.mp3',
  '/assets/aistudio/ReelAudio-81275_04277d43.mp3',
  '/assets/aistudio/ek_gand_pe_repta_497952d8.mp3',
  '/assets/aistudio/Rom-Rom-Bhaiyo_d96dfa22.mp3',
];

class SoundSynth {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private voiceBuffer: AudioBuffer | null = null;
  private voiceLoading: boolean = false;
  private activeVoiceSource: AudioBufferSourceNode | null = null;
  private fallbackVoiceAudio: HTMLAudioElement | null = null;

  private enemyBuffers: (AudioBuffer | null)[] = ENEMY_VOICE_URLS.map(() => null);
  private enemyLoading: boolean[] = ENEMY_VOICE_URLS.map(() => false);
  private activeEnemySource: AudioBufferSourceNode | null = null;
  private fallbackEnemyAudios: (HTMLAudioElement | null)[] = [];
  private activeFallbackEnemyAudio: HTMLAudioElement | null = null;
  private speakingEnemyId: number | null = null;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
    } catch {
      this.muted = false;
    }

    if (typeof Audio !== 'undefined') {
      const audio = new Audio(ATTACK_VOICE_URL);
      audio.preload = 'auto';
      audio.volume = 0.9;
      this.fallbackVoiceAudio = audio;

      this.fallbackEnemyAudios = ENEMY_VOICE_URLS.map((url) => {
        const ea = new Audio(url);
        ea.preload = 'auto';
        ea.volume = 0.88;
        return ea;
      });
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (mute) {
      this.stopAllVoices();
    }
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, String(mute));
    } catch {
      // Ignore storage errors
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.ctx) {
      if (!this.voiceBuffer && !this.voiceLoading) {
        this.preloadAttackVoice(this.ctx);
      }
      this.preloadEnemyVoices(this.ctx);
    }
    return this.ctx;
  }

  private preloadAttackVoice(ctx: AudioContext): void {
    this.voiceLoading = true;
    fetch(ATTACK_VOICE_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        this.voiceBuffer = decoded;
      })
      .catch(() => {
        // Fallback HTMLAudioElement will handle playback
      })
      .finally(() => {
        this.voiceLoading = false;
      });
  }

  private preloadEnemyVoices(ctx: AudioContext): void {
    ENEMY_VOICE_URLS.forEach((url, idx) => {
      if (this.enemyBuffers[idx] || this.enemyLoading[idx]) return;
      this.enemyLoading[idx] = true;
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then((buf) => ctx.decodeAudioData(buf))
        .then((decoded) => {
          this.enemyBuffers[idx] = decoded;
        })
        .catch(() => {
          // Fallback HTMLAudioElement will handle playback
        })
        .finally(() => {
          this.enemyLoading[idx] = false;
        });
    });
  }

  public unlock(): void {
    const ctx = this.ensureContext();
    if (ctx) {
      if (!this.voiceBuffer && !this.voiceLoading) {
        this.preloadAttackVoice(ctx);
      }
      this.preloadEnemyVoices(ctx);
    }
  }

  public stopAttackVoice(): void {
    if (this.activeVoiceSource) {
      try {
        this.activeVoiceSource.stop();
        this.activeVoiceSource.disconnect();
      } catch {
        // Ignore already stopped source
      }
      this.activeVoiceSource = null;
    }
    if (this.fallbackVoiceAudio) {
      try {
        this.fallbackVoiceAudio.pause();
        this.fallbackVoiceAudio.currentTime = 0;
      } catch {
        // Ignore media reset errors
      }
    }
  }

  public stopEnemyVoice(onlyEnemyId?: number): void {
    if (onlyEnemyId !== undefined && this.speakingEnemyId !== onlyEnemyId) {
      return;
    }
    this.speakingEnemyId = null;
    if (this.activeEnemySource) {
      try {
        this.activeEnemySource.stop();
        this.activeEnemySource.disconnect();
      } catch {
        // Ignore already stopped source
      }
      this.activeEnemySource = null;
    }
    if (this.activeFallbackEnemyAudio) {
      try {
        this.activeFallbackEnemyAudio.pause();
        this.activeFallbackEnemyAudio.currentTime = 0;
      } catch {
        // Ignore media reset errors
      }
      this.activeFallbackEnemyAudio = null;
    }
  }

  public stopAllVoices(): void {
    this.stopAttackVoice();
    this.stopEnemyVoice();
  }

  public isEnemyVoicePlaying(): boolean {
    return this.speakingEnemyId !== null;
  }

  public getSpeakingEnemyId(): number | null {
    return this.speakingEnemyId;
  }

  public getEnemyVoiceCount(): number {
    return ENEMY_VOICE_URLS.length;
  }

  public playEnemyVoice(voiceIndex: number, enemyId: number): void {
    if (this.muted) return;
    const idx = ((voiceIndex % ENEMY_VOICE_URLS.length) + ENEMY_VOICE_URLS.length) % ENEMY_VOICE_URLS.length;
    const ctx = this.ensureContext();
    this.stopEnemyVoice();
    this.speakingEnemyId = enemyId;

    const buffer = this.enemyBuffers[idx];
    if (ctx && buffer) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.88, ctx.currentTime);
      source.connect(gain);
      gain.connect(ctx.destination);
      source.onended = () => {
        if (this.activeEnemySource === source) {
          this.activeEnemySource = null;
        }
        if (this.speakingEnemyId === enemyId) {
          this.speakingEnemyId = null;
        }
      };
      this.activeEnemySource = source;
      source.start(0);
      return;
    }

    const fallback = this.fallbackEnemyAudios[idx];
    if (fallback) {
      try {
        fallback.currentTime = 0;
        fallback.onended = () => {
          if (this.activeFallbackEnemyAudio === fallback) {
            this.activeFallbackEnemyAudio = null;
          }
          if (this.speakingEnemyId === enemyId) {
            this.speakingEnemyId = null;
          }
        };
        this.activeFallbackEnemyAudio = fallback;
        fallback.play().catch(() => {
          if (this.speakingEnemyId === enemyId) {
            this.speakingEnemyId = null;
          }
        });
      } catch {
        this.speakingEnemyId = null;
      }
    } else {
      this.speakingEnemyId = null;
    }
  }

  public playAttackVoice(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    this.stopAttackVoice();

    if (ctx && this.voiceBuffer) {
      const source = ctx.createBufferSource();
      source.buffer = this.voiceBuffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.95, ctx.currentTime);
      source.connect(gain);
      gain.connect(ctx.destination);
      source.onended = () => {
        if (this.activeVoiceSource === source) {
          this.activeVoiceSource = null;
        }
      };
      this.activeVoiceSource = source;
      source.start(0);
      return;
    }

    if (this.fallbackVoiceAudio) {
      try {
        this.fallbackVoiceAudio.currentTime = 0;
        this.fallbackVoiceAudio.play().catch(() => {});
      } catch {
        // Ignore autoplay restrictions
      }
    }
  }

  public playShot(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(760, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.065);

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  public playSlash(combo: number = 1): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Sharp cyan blade sweep
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const baseFreq = Math.min(1150, 580 + (combo - 1) * 45);
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.09);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);

    // Subtle crisp chime overtone on combo
    if (combo >= 2) {
      const pentatonic = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
      const note = pentatonic[(combo - 2) % pentatonic.length];
      const chime = ctx.createOscillator();
      const chimeGain = ctx.createGain();
      chime.type = 'sine';
      chime.frequency.setValueAtTime(note, now + 0.015);
      chimeGain.gain.setValueAtTime(0.08, now + 0.015);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      chime.connect(chimeGain);
      chimeGain.connect(ctx.destination);
      chime.start(now + 0.015);
      chime.stop(now + 0.17);
    }
  }

  public playArmorHit(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'square';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(420, now);
    osc1.frequency.exponentialRampToValueAtTime(210, now + 0.08);
    osc2.frequency.setValueAtTime(675, now);
    osc2.frequency.exponentialRampToValueAtTime(340, now + 0.08);

    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.095);
    osc2.stop(now + 0.095);
  }

  public playNova(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Deep resonant pulse
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(190, now);
    sub.frequency.exponentialRampToValueAtTime(48, now + 0.32);
    subGain.gain.setValueAtTime(0.24, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.35);

    // Shimmering blade harmonic
    [440, 659.25, 880].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.025);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.4, now + 0.25);
      gain.gain.setValueAtTime(0.07, now + idx * 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.025);
      osc.stop(now + 0.3);
    });
  }

  public playDamage(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.22);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  public playLevelUp(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = now + i * 0.055;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.23);
    });
  }

  public playStart(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(330, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.12);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playGameOver(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const notes = [392.0, 329.63, 261.63, 196.0];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + i * 0.11;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.11, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }
}

export const soundSynth = new SoundSynth();
