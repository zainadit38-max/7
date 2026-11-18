import { soundSynth } from './audio';
import {
  Bullet,
  Enemy,
  EnemyKind,
  FloatingText,
  GameMode,
  GameState,
  HudSnapshot,
  Particle,
  RunStats,
  ShockwaveRing,
  SlashArc,
} from './types';

const HIGH_SCORE_PREFIX = 'fsn_highscore_v1_';
const CYAN_SPARK_COLORS = ['#00CFFF', '#00E5FF', '#00A3E0', '#38BDF8', '#7DD3FC'];
const PARTICLE_COLORS = ['#00CFFF', '#00E5FF', '#38BDF8', '#FFCC00'];
const POOL_SIZE = 320;

interface AmbientMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  cyan: boolean;
}

interface SofaAnchor {
  sofaX: number;
  sofaY: number;
  sofaW: number;
  aimOriginX: number;
  aimOriginY: number;
}

export class NinjaGameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private onHudChange: (snapshot: HudSnapshot) => void;

  private width = 1280;
  private height = 720;
  private dpr = 1;

  private rafId: number | null = null;
  private lastTime = 0;

  // Game state
  private state: GameState = 'TITLE_MENU';
  private mode: GameMode = 'classic';
  private score = 0;
  private highScore = 0;
  private level = 1;
  private kills = 0;
  private lives = 1;
  private maxLives = 1;
  private combo = 0;
  private bestCombo = 0;
  private comboTimer = 0;
  private novaCharge = 40;
  private enemyCounter = 1;
  private runStats: RunStats | null = null;

  // Simulation timers
  private spawnTimer = 0;
  private hitstopTimer = 0;
  private shakeIntensity = 0;
  private damageFlash = 0;
  private levelBannerTimer = 0;
  private levelBannerText = '';

  // Lounging hero & aim state
  private heroBreathPhase = 0;
  private handWavePhase = 0;
  private ribbonPhase = 0;
  private recoilKick = 0;
  private reticlePulse = 0;
  private aimX = 640;
  private aimY = 200;
  private lockedEnemyId: number | null = null;
  private enemyVoiceCursor = 0;
  private enemyVoiceCooldown = 0;
  private heroFaceImg: HTMLImageElement | null = null;
  private heroFaceLoaded = false;

  // Entities & pools
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private particles: Particle[] = [];
  private slashArcs: SlashArc[] = [];
  private rings: ShockwaveRing[] = [];
  private floatingTexts: FloatingText[] = [];
  private motes: AmbientMote[] = [];

  // Input tracking
  private activePointerId: number | null = null;

  // HUD diff tracking
  private lastHudKey = '';

  constructor(canvas: HTMLCanvasElement, onHudChange: (snapshot: HudSnapshot) => void) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not acquire 2D canvas context');
    }
    this.ctx = context;
    this.onHudChange = onHudChange;

    for (let i = 0; i < POOL_SIZE; i++) {
      this.particles.push({
        active: false,
        kind: 'ember',
        x: 0,
        y: 0,
        prevX: 0,
        prevY: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 3,
        color: '#00CFFF',
        drag: 0.14,
        gravity: 0,
        glow: true,
      });
    }

    if (typeof Image !== 'undefined') {
      const img = new Image();
      img.onload = () => {
        this.heroFaceLoaded = true;
      };
      img.src = '/assets/aistudio/IMG_20261118_122241_1bff395c.png';
      this.heroFaceImg = img;
    }

    this.highScore = this.loadHighScore(this.mode);
    this.resize();
    this.aimX = this.width / 2;
    this.aimY = this.height * 0.28;
    this.initAmbientMotes();
    this.bindEvents();
    this.emitHud(true);
    this.startLoop();
  }

  private getSofaAnchor(): SofaAnchor {
    const sofaX = this.width / 2;
    const sofaY = this.height - 26;
    const sofaW = Math.min(270, Math.max(190, this.width * 0.44));
    // Aim origin positioned at the waving/pressing hand in the middle of the actor's body
    const aimOriginX = sofaX;
    const aimOriginY = sofaY - 48 + Math.sin(this.handWavePhase) * 11 - this.recoilKick * 5;
    return { sofaX, sofaY, sofaW, aimOriginX, aimOriginY };
  }

  private loadHighScore(mode: GameMode): number {
    try {
      const raw = localStorage.getItem(`${HIGH_SCORE_PREFIX}${mode}`);
      const parsed = raw ? parseInt(raw, 10) : 0;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch {
      return 0;
    }
  }

  private saveHighScore(mode: GameMode, value: number): void {
    try {
      localStorage.setItem(`${HIGH_SCORE_PREFIX}${mode}`, String(value));
    } catch {
      // Ignore storage errors
    }
  }

  private initAmbientMotes(): void {
    this.motes = [];
    for (let i = 0; i < 24; i++) {
      this.motes.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 12,
        vy: -6 - Math.random() * 14,
        size: 1.5 + Math.random() * 2.2,
        alpha: 0.1 + Math.random() * 0.16,
        cyan: Math.random() < 0.35,
      });
    }
  }

  public resize = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(320, rect.width || window.innerWidth);
    const h = Math.max(320, rect.height || window.innerHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = w;
    this.height = h;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.aimX = Math.max(20, Math.min(w - 20, this.aimX));
    this.aimY = Math.max(20, Math.min(h - 90, this.aimY));
  };

  private bindEvents(): void {
    window.addEventListener('resize', this.resize);
    window.addEventListener('blur', this.handleWindowBlur);
    window.addEventListener('keydown', this.handleKeyDown);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
  }

  public destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('blur', this.handleWindowBlur);
    window.removeEventListener('keydown', this.handleKeyDown);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
  }

  private handleWindowBlur = (): void => {
    this.activePointerId = null;
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;

    if (e.code === 'KeyM') {
      this.toggleMute();
      return;
    }

    if (this.state === 'TITLE_MENU') {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.startGame(this.mode);
      }
      return;
    }

    if (this.state === 'PLAYING') {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        this.pauseGame();
      } else if (e.code === 'Space') {
        e.preventDefault();
        this.triggerNova();
      }
      return;
    }

    if (this.state === 'PAUSED') {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        this.resumeGame();
      }
      return;
    }

    if (this.state === 'GAME_OVER') {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyR') {
        e.preventDefault();
        this.startGame(this.mode);
      }
    }
  };

  private getCanvasCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  private updateAim(x: number, y: number): void {
    const { aimOriginY } = this.getSofaAnchor();
    this.aimX = Math.max(12, Math.min(this.width - 12, x));
    // Keep aim ray pointing upward above the sofa/legs
    this.aimY = Math.max(16, Math.min(aimOriginY - 24, y));
    const locked = this.findLockedEnemy(this.aimX, this.aimY);
    this.lockedEnemyId = locked ? locked.id : null;
  }

  private findLockedEnemy(ax: number, ay: number): Enemy | null {
    if (this.enemies.length === 0) return null;

    // 1. Direct proximity to cursor/tap point (generous 68px lock radius)
    let bestDirect: Enemy | null = null;
    let bestDirectDist = 68;
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - ax, e.y - ay);
      if (d < bestDirectDist) {
        bestDirectDist = d;
        bestDirect = e;
      }
    }
    if (bestDirect) return bestDirect;

    // 2. Ray lock along the dotted arrow from ninja's legs through (ax, ay)
    const { aimOriginX, aimOriginY } = this.getSofaAnchor();
    const dx = ax - aimOriginX;
    const dy = ay - aimOriginY;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // Extend ray up to top edge of screen
    const farX = aimOriginX + ux * Math.max(this.width, this.height) * 1.4;
    const farY = aimOriginY + uy * Math.max(this.width, this.height) * 1.4;

    let bestRay: Enemy | null = null;
    let bestRayDist = 42;
    for (const e of this.enemies) {
      const d = this.pointToSegmentDist(e.x, e.y, aimOriginX, aimOriginY, farX, farY);
      if (d < bestRayDist) {
        bestRayDist = d;
        bestRay = e;
      }
    }
    return bestRay;
  }

  private handlePointerMove = (e: PointerEvent): void => {
    if (this.state !== 'PLAYING') return;
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;
    const { x, y } = this.getCanvasCoords(e.clientX, e.clientY);
    this.updateAim(x, y);
  };

  private handlePointerDown = (e: PointerEvent): void => {
    if (this.state !== 'PLAYING') return;
    soundSynth.unlock();

    const { x, y } = this.getCanvasCoords(e.clientX, e.clientY);
    this.activePointerId = e.pointerId;
    this.updateAim(x, y);
    this.fireBullet();
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (this.activePointerId === null || e.pointerId === this.activePointerId) {
      this.activePointerId = null;
    }
  };

  private fireBullet(): void {
    const { aimOriginX, aimOriginY } = this.getSofaAnchor();
    const locked =
      this.lockedEnemyId !== null
        ? this.enemies.find((en) => en.id === this.lockedEnemyId) || null
        : null;

    const tx = locked ? locked.x : this.aimX;
    const ty = locked ? locked.y : this.aimY;

    const dx = tx - aimOriginX;
    const dy = ty - aimOriginY;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = 1850;

    this.bullets.push({
      x: aimOriginX,
      y: aimOriginY,
      prevX: aimOriginX,
      prevY: aimOriginY,
      vx: (dx / dist) * speed,
      vy: (dy / dist) * speed,
      targetId: locked ? locked.id : null,
      life: 1.1,
    });

    this.recoilKick = 1;
    soundSynth.playShot();

    // Subtle muzzle ring near the ninja's legs
    this.rings.push({
      x: aimOriginX,
      y: aimOriginY,
      radius: 4,
      maxRadius: 26,
      life: 0.16,
      maxLife: 0.16,
      color: '#00CFFF',
      lineWidth: 2.5,
    });
  }

  // Public API for React Game Shell
  public setMode(mode: GameMode): void {
    this.mode = mode;
    this.highScore = this.loadHighScore(mode);
    this.emitHud(true);
  }

  public startGame(mode: GameMode = this.mode): void {
    soundSynth.unlock();
    soundSynth.stopAllVoices();
    soundSynth.playStart();

    this.mode = mode;
    this.highScore = this.loadHighScore(mode);
    this.state = 'PLAYING';
    this.score = 0;
    this.level = 1;
    this.kills = 0;
    this.maxLives = mode === 'zen' ? 0 : 1;
    this.lives = this.maxLives;
    this.combo = 0;
    this.bestCombo = 0;
    this.comboTimer = 0;
    this.novaCharge = 40;
    this.enemyCounter = 1;
    this.enemyVoiceCooldown = 0;
    this.runStats = null;

    this.enemies = [];
    this.bullets = [];
    this.slashArcs = [];
    this.rings = [];
    this.floatingTexts = [];
    for (const p of this.particles) p.active = false;

    this.hitstopTimer = 0;
    this.shakeIntensity = 0;
    this.damageFlash = 0;
    this.levelBannerTimer = 1.2;
    this.levelBannerText = 'LEVEL 1';
    this.spawnTimer = 0.25;
    this.recoilKick = 0;
    this.lockedEnemyId = null;
    this.aimX = this.width / 2;
    this.aimY = this.height * 0.28;

    this.spawnEnemy();
    this.emitHud(true);
  }

  public pauseGame(): void {
    if (this.state !== 'PLAYING') return;
    this.state = 'PAUSED';
    soundSynth.stopAllVoices();
    this.emitHud(true);
  }

  public resumeGame(): void {
    if (this.state !== 'PAUSED') return;
    this.state = 'PLAYING';
    this.lastTime = performance.now();
    this.emitHud(true);
  }

  public quitToTitle(): void {
    this.state = 'TITLE_MENU';
    soundSynth.stopAllVoices();
    this.enemyVoiceCooldown = 0;
    this.enemies = [];
    this.bullets = [];
    this.slashArcs = [];
    this.rings = [];
    this.floatingTexts = [];
    this.lockedEnemyId = null;
    this.runStats = null;
    this.emitHud(true);
  }

  public toggleMute(): boolean {
    const muted = soundSynth.toggleMute();
    this.emitHud(true);
    return muted;
  }

  public triggerNova(): void {
    if (this.state !== 'PLAYING' || this.novaCharge < 100) return;
    soundSynth.unlock();
    soundSynth.playNova();

    this.novaCharge = 0;
    const { aimOriginX, aimOriginY } = this.getSofaAnchor();
    const novaRadius = Math.max(this.width, this.height) * 0.9;

    this.rings.push({
      x: aimOriginX,
      y: aimOriginY,
      radius: 26,
      maxRadius: novaRadius,
      life: 0.45,
      maxLife: 0.45,
      color: '#00CFFF',
      lineWidth: 5,
    });
    this.rings.push({
      x: aimOriginX,
      y: aimOriginY,
      radius: 16,
      maxRadius: novaRadius * 0.72,
      life: 0.36,
      maxLife: 0.36,
      color: '#FFCC00',
      lineWidth: 3,
    });

    this.shakeIntensity = 11;
    this.hitstopTimer = 0.05;
    this.recoilKick = 1.2;

    let cleared = 0;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      soundSynth.stopEnemyVoice(e.id);
      const slashAngle = Math.atan2(e.y - aimOriginY, e.x - aimOriginX);
      this.spawnCyanEnergySparks(e.x, e.y, slashAngle, 26);
      this.slashArcs.push({
        x: e.x,
        y: e.y,
        angle: slashAngle,
        radius: 42,
        life: 0.22,
        maxLife: 0.22,
        color: '#00CFFF',
        fromX: aimOriginX,
        fromY: aimOriginY,
      });
      this.enemies.splice(i, 1);
      cleared++;
      this.awardKill(e.x, e.y, false);
    }

    this.lockedEnemyId = null;
    this.floatingTexts.push({
      x: this.width / 2,
      y: this.height * 0.34,
      vy: -36,
      text: cleared > 0 ? `BLADE NOVA ×${cleared}` : 'BLADE NOVA',
      color: '#0099CC',
      life: 0.85,
      maxLife: 0.85,
      scale: 1.12,
    });

    this.emitHud();
  }

  private emitHud(force: boolean = false): void {
    const novaRounded = Math.floor(this.novaCharge);
    const key = `${this.state}|${this.mode}|${this.score}|${this.highScore}|${this.level}|${this.lives}|${this.combo}|${this.kills}|${novaRounded}|${soundSynth.isMuted()}`;
    if (!force && key === this.lastHudKey) return;
    this.lastHudKey = key;

    this.onHudChange({
      state: this.state,
      mode: this.mode,
      score: this.score,
      highScore: this.highScore,
      level: this.level,
      lives: this.lives,
      maxLives: this.maxLives,
      combo: this.combo,
      kills: this.kills,
      novaCharge: novaRounded,
      muted: soundSynth.isMuted(),
      runStats: this.runStats,
    });
  }

  private startLoop(): void {
    this.lastTime = performance.now();
    const tick = (now: number) => {
      const rawDt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      this.update(dt);
      this.render();

      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private update(dt: number): void {
    this.heroBreathPhase += dt * 2.4;
    this.handWavePhase += dt * 3.8;
    this.ribbonPhase += dt * 4.5;
    this.reticlePulse += dt * 5.2;
    if (this.enemyVoiceCooldown > 0) {
      this.enemyVoiceCooldown = Math.max(0, this.enemyVoiceCooldown - dt);
    }

    for (const m of this.motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.y < -10) {
        m.y = this.height + 10;
        m.x = Math.random() * this.width;
      }
      if (m.x < -10) m.x = this.width + 10;
      if (m.x > this.width + 10) m.x = -10;
    }

    if (this.state === 'GAME_OVER') {
      if (this.shakeIntensity > 0) {
        this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 36);
      }
      if (this.damageFlash > 0) {
        this.damageFlash = Math.max(0, this.damageFlash - dt * 2.6);
      }
      this.updateEffects(dt);
      return;
    }

    if (this.state !== 'PLAYING') {
      return;
    }

    if (this.shakeIntensity > 0) {
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 36);
    }
    if (this.damageFlash > 0) {
      this.damageFlash = Math.max(0, this.damageFlash - dt * 3.2);
    }
    if (this.levelBannerTimer > 0) {
      this.levelBannerTimer = Math.max(0, this.levelBannerTimer - dt);
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      return;
    }

    this.recoilKick *= Math.pow(0.0008, dt);

    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.emitHud();
      }
    }

    if (this.novaCharge < 100) {
      this.novaCharge = Math.min(100, this.novaCharge + dt * 2.2);
      this.emitHud();
    }

    // Enemy spawning across the top sky (kid-friendly pacing)
    this.spawnTimer -= dt;
    const maxConcurrent = Math.min(
      7,
      (this.mode === 'blitz' ? 3 : 2) + Math.floor(this.level * 0.65)
    );
    if (this.spawnTimer <= 0 && this.enemies.length < maxConcurrent) {
      this.spawnEnemy();
      const baseInterval = this.mode === 'blitz' ? 1.65 : 2.4;
      const ramp = this.level * (this.mode === 'blitz' ? 0.08 : 0.07);
      this.spawnTimer = Math.max(0.9, baseInterval - ramp) * (0.85 + Math.random() * 0.3);
    } else if (this.enemies.length === 0) {
      this.spawnTimer = Math.min(this.spawnTimer, 0.45);
    }

    // Update overhead flowing enemies (Left <-> Right)
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.phase += dt * 5.0;
      if (e.hitFlash > 0) {
        e.hitFlash = Math.max(0, e.hitFlash - dt * 6);
      }

      if (e.kind === 'dasher') {
        if (e.dashState === 'approach') {
          e.x += e.dirX * e.speed * dt;
          e.y = e.baseY + Math.sin(e.phase * 0.5) * 10;
          const enteredMid =
            (e.dirX === 1 && e.x > this.width * 0.28) ||
            (e.dirX === -1 && e.x < this.width * 0.72);
          if (enteredMid) {
            e.dashState = 'windup';
            e.dashTimer = 0.75;
          }
        } else if (e.dashState === 'windup') {
          e.dashTimer -= dt;
          if (e.dashTimer <= 0) {
            e.dashState = 'dashing';
            e.dashTimer = 0.9;
          }
        } else {
          e.x += e.dirX * e.speed * 1.45 * dt;
          e.y = e.baseY + Math.sin(e.phase * 0.5) * 8;
        }
      } else if (e.kind === 'weaver') {
        e.x += e.dirX * e.speed * dt;
        e.y = e.baseY + Math.sin(e.phase * 0.65) * 26 * e.perpSign;
      } else {
        e.x += e.dirX * e.speed * dt;
        e.y = e.baseY + Math.sin(e.phase * 0.55) * 12;
      }

      // Play enemy voice line as this enemy enters and glides across the screen
      if (
        !e.hasSpoken &&
        e.x > 24 &&
        e.x < this.width - 24 &&
        !soundSynth.isEnemyVoicePlaying() &&
        this.enemyVoiceCooldown <= 0
      ) {
        e.hasSpoken = true;
        soundSynth.playEnemyVoice(e.voiceIndex, e.id);
      }

      // Check if enemy crossed completely across the screen without being hit
      const escaped =
        (e.dirX === 1 && e.x > this.width + 55) ||
        (e.dirX === -1 && e.x < -55);
      if (escaped) {
        this.handleEnemyEscaped(i, e);
        if (this.state !== 'PLAYING') return;
      }
    }

    // Re-evaluate lock target dynamically as enemies glide
    const locked = this.findLockedEnemy(this.aimX, this.aimY);
    this.lockedEnemyId = locked ? locked.id : null;

    // Update bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.prevX = b.x;
      b.prevY = b.y;
      b.life -= dt;

      // Subtle homing onto locked target so shots feel snappy and rewarding
      if (b.targetId !== null) {
        const target = this.enemies.find((en) => en.id === b.targetId);
        if (target) {
          const dx = target.x - b.x;
          const dy = target.y - b.y;
          const d = Math.hypot(dx, dy) || 1;
          const speed = Math.hypot(b.vx, b.vy) || 1850;
          b.vx = (dx / d) * speed;
          b.vy = (dy / d) * speed;
        }
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      let hitHandled = false;
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j];
        const dist = this.pointToSegmentDist(e.x, e.y, b.prevX, b.prevY, b.x, b.y);
        if (dist <= 36 * e.scale + 8) {
          this.bullets.splice(i, 1);
          this.hitEnemy(j, e);
          this.emitHud();
          hitHandled = true;
          break;
        }
      }

      if (hitHandled) continue;

      if (
        b.life <= 0 ||
        b.x < -60 ||
        b.x > this.width + 60 ||
        b.y < -60 ||
        b.y > this.height + 60
      ) {
        this.bullets.splice(i, 1);
      }
    }

    this.updateEffects(dt);
  }

  private updateEffects(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.prevX = p.x;
      p.prevY = p.y;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const damp = Math.pow(p.drag, dt);
      p.vx *= damp;
      p.vy *= damp;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
      }
    }

    for (let i = this.slashArcs.length - 1; i >= 0; i--) {
      this.slashArcs[i].life -= dt;
      if (this.slashArcs[i].life <= 0) this.slashArcs.splice(i, 1);
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const progress = 1 - Math.max(0, r.life / r.maxLife);
      r.radius = 24 + (r.maxRadius - 24) * (1 - Math.pow(1 - progress, 3));
      if (r.life <= 0) this.rings.splice(i, 1);
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      if (ft.vx) {
        ft.x += ft.vx * dt;
        ft.vx *= Math.pow(0.1, dt);
      }
      ft.y += ft.vy * dt;
      if (ft.isCombo) {
        ft.vy *= Math.pow(0.06, dt);
      }
      ft.life -= dt;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  private spawnEnemy(): void {
    // Spawn on Left or Right edge in the upper sky zone
    const fromLeft = Math.random() < 0.5;
    const dirX: 1 | -1 = fromLeft ? 1 : -1;
    const pad = 42;
    const x = fromLeft ? -pad : this.width + pad;

    const topMin = this.width < 640 ? 148 : 112;
    const topMax = Math.max(topMin + 40, Math.min(this.height * 0.44, this.height - 220));
    const baseY = topMin + Math.random() * (topMax - topMin);

    let kind: EnemyKind = 'runner';
    const roll = Math.random();
    if (this.level >= 4 && roll < 0.2) {
      kind = 'weaver';
    } else if (this.level >= 3 && roll < 0.42) {
      kind = 'brute';
    } else if (this.level >= 2 && roll < 0.65) {
      kind = 'dasher';
    }

    const modeMult = this.mode === 'blitz' ? 1.25 : this.mode === 'zen' ? 0.85 : 1.0;
    const basePxPerSec = (34 + this.level * 5.2) * modeMult;
    let speed = basePxPerSec;
    let scale = 0.85;
    let hp = 1;

    if (kind === 'dasher') {
      speed = basePxPerSec * 0.95;
      scale = 0.82;
    } else if (kind === 'brute') {
      speed = basePxPerSec * 0.78;
      scale = 1.05;
      hp = 2;
    } else if (kind === 'weaver') {
      speed = basePxPerSec * 0.9;
      scale = 0.83;
    }

    const num = this.enemyCounter++;
    this.enemies.push({
      id: num,
      number: num,
      kind,
      x,
      y: baseY,
      baseY,
      dirX,
      vx: 0,
      vy: 0,
      speed,
      scale,
      hp,
      maxHp: hp,
      phase: Math.random() * Math.PI * 2,
      hitFlash: 0,
      dashState: 'approach',
      dashTimer: 0,
      dashDirX: dirX,
      dashDirY: 0,
      perpSign: Math.random() < 0.5 ? 1 : -1,
      voiceIndex: this.enemyVoiceCursor++ % soundSynth.getEnemyVoiceCount(),
      hasSpoken: false,
    });
  }

  private pointToSegmentDist(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.hypot(px - projX, py - projY);
  }

  private hitEnemy(index: number, e: Enemy): void {
    const { aimOriginX, aimOriginY } = this.getSofaAnchor();
    const angle = Math.atan2(e.y - aimOriginY, e.x - aimOriginX);

    this.slashArcs.push({
      x: e.x,
      y: e.y,
      angle: angle + (Math.random() - 0.5) * 0.6,
      radius: 40 * e.scale,
      life: 0.18,
      maxLife: 0.18,
      color: '#00CFFF',
      fromX: aimOriginX,
      fromY: aimOriginY,
    });

    e.hp -= 1;
    if (e.hp > 0) {
      e.hitFlash = 1;
      e.speed *= 0.85;
      // Slight pushback along bullet angle
      e.x += Math.cos(angle) * 20;
      this.spawnBurst(e.x, e.y, 12, '#FFCC00');
      soundSynth.playArmorHit();
      this.shakeIntensity = Math.max(this.shakeIntensity, 4);
      this.hitstopTimer = 0.025;
      this.floatingTexts.push({
        x: e.x,
        y: e.y - 36,
        vy: -42,
        text: 'CRACK!',
        color: '#D97706',
        life: 0.55,
        maxLife: 0.55,
        scale: 0.9,
      });
      return;
    }

    // Stop this enemy's voice if active, then play ninja attack voice
    soundSynth.stopEnemyVoice(e.id);
    this.enemyVoiceCooldown = 0.7;
    soundSynth.playAttackVoice();

    this.enemies.splice(index, 1);
    if (this.lockedEnemyId === e.id) {
      this.lockedEnemyId = null;
    }

    // Burst of cyan energy sparks + shockwave ring when enemy is sliced
    this.spawnCyanEnergySparks(e.x, e.y, angle, 32);
    this.rings.push({
      x: e.x,
      y: e.y,
      radius: 8,
      maxRadius: 48 * e.scale,
      life: 0.22,
      maxLife: 0.22,
      color: '#00CFFF',
      lineWidth: 2.5,
    });
    this.awardKill(e.x, e.y, true);
  }

  private awardKill(x: number, y: number, playSfx: boolean): void {
    this.kills += 1;
    this.combo += 1;
    this.comboTimer = 1.85;
    if (this.combo > this.bestCombo) {
      this.bestCombo = this.combo;
    }

    const comboBonus = this.combo >= 5 ? 2 : this.combo >= 3 ? 1 : 0;
    const points = 1 + comboBonus;
    this.score += points;

    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.saveHighScore(this.mode, this.highScore);
    }

    this.novaCharge = Math.min(100, this.novaCharge + 9);

    if (playSfx) {
      soundSynth.playSlash(this.combo);
      this.shakeIntensity = Math.max(this.shakeIntensity, this.combo >= 4 ? 6 : 3.5);
      this.hitstopTimer = this.combo >= 4 ? 0.042 : 0.028;
    }

    const safeX = Math.max(78, Math.min(this.width - 78, x));
    const safeY = Math.max(72, Math.min(this.height - 120, y - 24));

    if (this.combo >= 3) {
      const tierColor =
        this.combo >= 8 ? '#E11D48' : this.combo >= 5 ? '#D97706' : '#0088B8';
      const glowColor =
        this.combo >= 8
          ? 'rgba(225, 29, 72, 0.35)'
          : this.combo >= 5
            ? 'rgba(245, 158, 11, 0.35)'
            : 'rgba(0, 207, 255, 0.45)';
      const scaleBoost = Math.min(1.45, 1.05 + (this.combo - 3) * 0.06);

      this.floatingTexts.push({
        x: safeX,
        y: safeY,
        vx: (Math.random() - 0.5) * 26,
        vy: -115,
        text: `${this.combo}× COMBO!`,
        subText: `+${points}`,
        color: tierColor,
        glowColor,
        life: 0.9,
        maxLife: 0.9,
        scale: scaleBoost,
        isCombo: true,
        tilt: (Math.random() - 0.5) * 0.14,
      });
    } else {
      this.floatingTexts.push({
        x: safeX,
        y: safeY - 8,
        vy: -48,
        text: `+${points}`,
        color: '#09090B',
        life: 0.65,
        maxLife: 0.65,
        scale: 0.95,
      });
    }

    const nextLevel = Math.floor(this.kills / 10) + 1;
    if (nextLevel > this.level) {
      this.level = nextLevel;
      this.levelBannerText = `LEVEL ${this.level}`;
      this.levelBannerTimer = 1.35;
      soundSynth.playLevelUp();
      const { sofaX, sofaY } = this.getSofaAnchor();
      this.rings.push({
        x: sofaX,
        y: sofaY - 40,
        radius: 30,
        maxRadius: 240,
        life: 0.5,
        maxLife: 0.5,
        color: '#00CFFF',
        lineWidth: 4,
      });
    }
  }

  private handleEnemyEscaped(index: number, e: Enemy): void {
    soundSynth.stopEnemyVoice(e.id);
    this.enemies.splice(index, 1);
    if (this.lockedEnemyId === e.id) {
      this.lockedEnemyId = null;
    }

    const edgeX = e.dirX === 1 ? this.width - 28 : 28;
    this.spawnBurst(edgeX, e.y, 16, '#E11D48');
    soundSynth.playDamage();
    this.shakeIntensity = 10;
    this.damageFlash = 0.85;
    this.combo = 0;
    this.comboTimer = 0;

    if (this.mode === 'zen') {
      this.score = Math.max(0, this.score - 1);
      this.floatingTexts.push({
        x: Math.max(60, Math.min(this.width - 60, edgeX)),
        y: e.y,
        vy: -36,
        text: '-1',
        color: '#E11D48',
        life: 0.7,
        maxLife: 0.7,
        scale: 1,
      });
      this.emitHud();
      return;
    }

    this.lives = Math.max(0, this.lives - 1);
    if (this.lives <= 0) {
      this.triggerGameOver();
    } else {
      this.emitHud(true);
    }
  }

  private triggerGameOver(): void {
    this.state = 'GAME_OVER';
    soundSynth.stopAllVoices();
    this.enemyVoiceCooldown = 0;
    soundSynth.playGameOver();

    const prevBest = this.loadHighScore(this.mode);
    const isNewBest = this.score > 0 && this.score >= prevBest;
    if (this.score > prevBest) {
      this.highScore = this.score;
      this.saveHighScore(this.mode, this.score);
    }

    this.runStats = {
      score: this.score,
      highScore: this.highScore,
      isNewBest,
      level: this.level,
      kills: this.kills,
      bestCombo: this.bestCombo,
      mode: this.mode,
    };
    this.emitHud(true);
  }

  private spawnCyanEnergySparks(
    x: number,
    y: number,
    slashAngle: number,
    count: number
  ): void {
    let spawned = 0;
    const perpAngle = slashAngle + Math.PI / 2;

    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (p.active) continue;

      const roll = Math.random();
      p.active = true;
      p.x = x + (Math.random() - 0.5) * 8;
      p.y = y + (Math.random() - 0.5) * 8;
      p.prevX = p.x;
      p.prevY = p.y;
      p.color = CYAN_SPARK_COLORS[Math.floor(Math.random() * CYAN_SPARK_COLORS.length)];
      p.glow = true;

      if (roll < 0.62) {
        // High-velocity cyan energy spark streaks spraying along slash + perpendicular fan
        const alignToPerp = Math.random() < 0.55;
        const baseDir = alignToPerp ? perpAngle : slashAngle;
        const flip = Math.random() < 0.5 ? 1 : -1;
        const angle = baseDir + (alignToPerp && flip < 0 ? Math.PI : 0) + (Math.random() - 0.5) * 0.7;
        const speed = 230 + Math.random() * 340;
        const maxLife = 0.26 + Math.random() * 0.22;

        p.kind = 'spark';
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.life = maxLife;
        p.maxLife = maxLife;
        p.size = 2.2 + Math.random() * 2.0;
        p.drag = 0.08;
        p.gravity = 90;
      } else if (roll < 0.85) {
        // Sharp diamond energy shards
        const angle = Math.random() * Math.PI * 2;
        const speed = 130 + Math.random() * 210;
        const maxLife = 0.34 + Math.random() * 0.24;

        p.kind = 'shard';
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.life = maxLife;
        p.maxLife = maxLife;
        p.size = 3.2 + Math.random() * 3.0;
        p.drag = 0.14;
        p.gravity = 150;
      } else {
        // Floating glowing cyan energy embers
        const angle = Math.random() * Math.PI * 2;
        const speed = 75 + Math.random() * 145;
        const maxLife = 0.4 + Math.random() * 0.28;

        p.kind = 'ember';
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed - 30;
        p.life = maxLife;
        p.maxLife = maxLife;
        p.size = 2.0 + Math.random() * 2.4;
        p.drag = 0.22;
        p.gravity = -25;
      }

      spawned++;
    }
  }

  private spawnBurst(x: number, y: number, count: number, forcedColor?: string): void {
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (p.active) continue;
      const angle = Math.random() * Math.PI * 2;
      const speed = 110 + Math.random() * 260;
      const maxLife = 0.35 + Math.random() * 0.25;
      p.active = true;
      p.kind = spawned % 2 === 0 ? 'spark' : 'ember';
      p.x = x;
      p.y = y;
      p.prevX = x;
      p.prevY = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = maxLife;
      p.maxLife = maxLife;
      p.size = 2.4 + Math.random() * 3.6;
      p.color =
        forcedColor || PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
      p.drag = 0.16;
      p.gravity = 60;
      p.glow = !forcedColor || forcedColor === '#00CFFF';
      spawned++;
    }
  }

  // ==================== RENDERING ====================
  private render(): void {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const anchor = this.getSofaAnchor();

    ctx.save();

    if (this.shakeIntensity > 0.2) {
      const sx = (Math.random() - 0.5) * this.shakeIntensity * 1.4;
      const sy = (Math.random() - 0.5) * this.shakeIntensity * 1.4;
      ctx.translate(sx, sy);
    }

    // 1. Crisp Pure White Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-20, -20, w + 40, h + 40);

    // Subtle radial aura behind the ground sofa
    const aura = ctx.createRadialGradient(
      anchor.sofaX,
      anchor.sofaY - 40,
      20,
      anchor.sofaX,
      anchor.sofaY - 40,
      Math.max(w, h) * 0.45
    );
    aura.addColorStop(0, 'rgba(0, 207, 255, 0.05)');
    aura.addColorStop(1, 'rgba(9, 9, 11, 0)');
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, w, h);

    // Subtle ground horizon line
    ctx.strokeStyle = 'rgba(9, 9, 11, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, h - 16);
    ctx.lineTo(w, h - 16);
    ctx.stroke();

    // Stylish, slim, centered "ZAIN" emblem on the white background
    this.drawCenteredZainEmblem(ctx, w, h);

    // Ambient floating ink & cyan motes
    for (const m of this.motes) {
      ctx.globalAlpha = m.alpha;
      ctx.fillStyle = m.cyan ? '#00B8E6' : '#09090B';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Dotted aim arrow originating near the ninja's legs
    if (this.state === 'PLAYING' || this.state === 'PAUSED') {
      this.drawAimDottedArrow(ctx, anchor);
    } else if (this.state === 'TITLE_MENU') {
      this.drawTitlePreviewArrow(ctx, anchor);
    }

    // Shockwave rings
    for (const r of this.rings) {
      const alpha = Math.max(0, r.life / r.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha * 0.75;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.lineWidth;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Overhead flowing enemies + lock reticle
    for (const e of this.enemies) {
      this.drawEnemy(ctx, e);
      if (this.state === 'PLAYING' && e.id === this.lockedEnemyId) {
        this.drawLockReticle(ctx, e.x, e.y, e.scale);
      }
    }

    // Bullets in flight
    for (const b of this.bullets) {
      ctx.save();
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#00CFFF';
      ctx.strokeStyle = '#00CFFF';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.prevX - b.vx * 0.015, b.prevY - b.vy * 0.015);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Ground Sofa / Bed + Lounging Stickman Ninja
    this.drawSofaAndLoungingNinja(ctx, anchor);

    // Impact slash/hit bursts
    for (const s of this.slashArcs) {
      const t = Math.max(0, s.life / s.maxLife);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.globalAlpha = t;
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#00CFFF';
      ctx.strokeStyle = '#00CFFF';
      ctx.lineWidth = 5 * t;
      ctx.beginPath();
      ctx.arc(0, 0, s.radius, -1.0, 1.0);
      ctx.stroke();

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2 * t;
      ctx.beginPath();
      ctx.arc(0, 0, s.radius, -0.75, 0.75);
      ctx.stroke();
      ctx.restore();
    }

    // Pooled Particles (Cyan Energy Sparks, Shards, and Embers)
    for (const p of this.particles) {
      if (!p.active) continue;
      const t = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = t;

      if (p.glow) {
        ctx.shadowBlur = p.kind === 'spark' ? 10 : 6;
        ctx.shadowColor = p.color;
      }

      if (p.kind === 'spark') {
        const tailX = p.prevX - p.vx * 0.014;
        const tailY = p.prevY - p.vy * 0.014;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1.2, p.size * (0.45 + t * 0.65));
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();

        // Crisp white-cyan hot core tip
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ECFEFF';
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.9, p.size * 0.36 * t), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'shard') {
        const angle = Math.atan2(p.vy, p.vx);
        const s = p.size * (0.4 + t * 0.6);
        ctx.translate(p.x, p.y);
        ctx.rotate(angle);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = '#0099CC';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s * 1.3, 0);
        ctx.lineTo(0, s * 0.55);
        ctx.lineTo(-s * 1.1, 0);
        ctx.lineTo(0, -s * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.35 + t * 0.65), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    // Floating combat texts
    for (const ft of this.floatingTexts) {
      const progress = 1 - Math.max(0, ft.life / ft.maxLife);
      const alpha = progress < 0.65 ? 1 : Math.max(0, (1 - progress) / 0.35);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(ft.x, ft.y);

      if (ft.isCombo) {
        const pop =
          progress < 0.18
            ? 0.65 + (progress / 0.18) * 0.55
            : progress < 0.32
              ? 1.2 - ((progress - 0.18) / 0.14) * 0.2
              : 1;
        const finalScale = ft.scale * pop;
        ctx.scale(finalScale, finalScale);
        if (ft.tilt) ctx.rotate(ft.tilt);

        ctx.font = '800 20px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (ft.glowColor) {
          ctx.shadowBlur = 12;
          ctx.shadowColor = ft.glowColor;
        }
        ctx.lineJoin = 'round';
        ctx.lineWidth = 4.5;
        ctx.strokeStyle = '#FFFFFF';
        ctx.strokeText(ft.text, 0, 0);

        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, 0, 0);

        if (ft.subText) {
          ctx.shadowBlur = 0;
          ctx.font = '700 13px "JetBrains Mono", monospace';
          ctx.lineWidth = 3.5;
          ctx.strokeStyle = '#FFFFFF';
          ctx.strokeText(ft.subText, 0, 19);
          ctx.fillStyle = '#09090B';
          ctx.fillText(ft.subText, 0, 19);
        }
      } else {
        ctx.fillStyle = ft.color;
        ctx.font = `700 ${Math.round(16 * ft.scale)}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, 0, 0);
      }

      ctx.restore();
    }

    // Level-up callout
    if (this.levelBannerTimer > 0 && this.state === 'PLAYING') {
      const alpha = Math.min(1, this.levelBannerTimer * 1.4);
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = '#09090B';
      ctx.font = '800 18px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.levelBannerText, w / 2, w < 640 ? 124 : 96);
      ctx.restore();
    }

    // Crimson edge damage vignette
    if (this.damageFlash > 0) {
      const grad = ctx.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.28,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.72
      );
      grad.addColorStop(0, 'rgba(225, 29, 72, 0)');
      grad.addColorStop(1, `rgba(225, 29, 72, ${this.damageFlash * 0.35})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
  }

  private drawCenteredZainEmblem(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.save();
    const cx = w / 2;
    const cy = this.state === 'TITLE_MENU' ? h * 0.48 : h * 0.56;
    const size = Math.round(Math.min(w * 0.075, h * 0.07, 46));
    const letters = ['Z', 'A', 'I', 'N'];
    const gap = size * 0.92;
    const totalW = gap * (letters.length - 1);

    ctx.translate(cx, cy);

    const ruleHalf = Math.max(54, totalW * 0.48);
    ctx.strokeStyle = 'rgba(9, 9, 11, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-ruleHalf, -size * 0.72);
    ctx.lineTo(-10, -size * 0.72);
    ctx.moveTo(10, -size * 0.72);
    ctx.lineTo(ruleHalf, -size * 0.72);
    ctx.stroke();

    ctx.fillStyle = '#00B8E6';
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.72 - 4);
    ctx.lineTo(4, -size * 0.72);
    ctx.lineTo(0, -size * 0.72 + 4);
    ctx.lineTo(-4, -size * 0.72);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#111111';
    ctx.font = `500 ${size}px "Cormorant Garamond", "Outfit", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    letters.forEach((ch, idx) => {
      const lx = -totalW / 2 + idx * gap;
      ctx.fillText(ch, lx, 0);
    });

    const grad = ctx.createLinearGradient(-ruleHalf - 12, 0, ruleHalf + 18, 0);
    grad.addColorStop(0, 'rgba(17, 17, 17, 0.15)');
    grad.addColorStop(0.55, 'rgba(17, 17, 17, 0.75)');
    grad.addColorStop(1, 'rgba(0, 207, 255, 0.9)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-ruleHalf - 12, size * 0.62);
    ctx.quadraticCurveTo(0, size * 0.5, ruleHalf + 18, size * 0.66);
    ctx.stroke();

    ctx.restore();
  }

  private drawSofaAndLoungingNinja(ctx: CanvasRenderingContext2D, anchor: SofaAnchor): void {
    const { sofaX, sofaY, sofaW, aimOriginX, aimOriginY } = anchor;
    const halfW = sofaW / 2;
    const breath = Math.sin(this.heroBreathPhase) * 1.4;
    const kick = this.recoilKick * 5;

    ctx.save();

    // Soft floor shadow under sofa
    ctx.fillStyle = 'rgba(9, 9, 11, 0.08)';
    ctx.beginPath();
    ctx.ellipse(sofaX, sofaY + 10, halfW + 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sofa legs
    ctx.strokeStyle = '#09090B';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sofaX - halfW + 18, sofaY);
    ctx.lineTo(sofaX - halfW + 14, sofaY + 10);
    ctx.moveTo(sofaX + halfW - 18, sofaY);
    ctx.lineTo(sofaX + halfW - 14, sofaY + 10);
    ctx.stroke();

    // Sofa backrest cushion
    ctx.fillStyle = '#F4F4F5';
    ctx.strokeStyle = '#09090B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(sofaX - halfW + 10, sofaY - 46, sofaW - 20, 26, 10);
    ctx.fill();
    ctx.stroke();

    // Sofa seat base / mattress
    ctx.fillStyle = '#FAFAFA';
    ctx.beginPath();
    ctx.roundRect(sofaX - halfW, sofaY - 24, sofaW, 24, 8);
    ctx.fill();
    ctx.stroke();

    // Left & right armrests
    ctx.fillStyle = '#E4E4E7';
    ctx.beginPath();
    ctx.roundRect(sofaX - halfW - 4, sofaY - 38, 22, 38, 8);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(sofaX + halfW - 18, sofaY - 34, 22, 34, 8);
    ctx.fill();
    ctx.stroke();

    // === Slim Stickman Actor Lying/Lounging on the Sofa ===
    const headX = sofaX - halfW * 0.56;
    const headY = sofaY - 42 + breath * 0.4;
    const faceR = 19;
    const shoulderX = headX + 20;
    const shoulderY = sofaY - 27 + breath * 0.5;
    const hipX = sofaX + halfW * 0.04;
    const hipY = sofaY - 24;
    const kneeX = sofaX + halfW * 0.34;
    const kneeY = sofaY - 36 - kick * 0.6;
    const footX = sofaX + halfW * 0.54;
    const footY = sofaY - 26 - kick;

    // Cozy pillow centered cleanly under actor's head on left side
    ctx.save();
    ctx.translate(headX - 8, sofaY - 29);
    ctx.rotate(-0.16);
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#09090B';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(-22, -10, 44, 18, 7);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Flowing crimson headband ribbon trailing behind the head
    ctx.save();
    ctx.strokeStyle = '#E11D48';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    const w1 = Math.sin(this.ribbonPhase) * 4;
    ctx.beginPath();
    ctx.moveTo(headX - faceR + 2, headY - 4);
    ctx.quadraticCurveTo(headX - faceR - 14, headY - 9 + w1, headX - faceR - 26, headY + 1 - w1 * 0.6);
    ctx.stroke();
    ctx.restore();

    // Slim black stickman torso & limbs
    ctx.strokeStyle = '#050505';
    ctx.fillStyle = '#050505';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Neck + reclining torso
    ctx.beginPath();
    ctx.moveTo(headX + faceR * 0.68, headY + faceR * 0.5);
    ctx.lineTo(shoulderX, shoulderY);
    ctx.lineTo(hipX, hipY);
    ctx.stroke();

    // Left arm resting comfortably behind head
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(headX + 4, headY + 12);
    ctx.stroke();

    // Legs bent comfortably on sofa
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(kneeX, kneeY);
    ctx.lineTo(footX, footY);
    ctx.moveTo(hipX, hipY + 1);
    ctx.lineTo(kneeX + 10, sofaY - 26);
    ctx.lineTo(footX + 8, sofaY - 26);
    ctx.stroke();

    // Face portrait photo clipped cleanly onto the main actor's head
    ctx.save();
    ctx.beginPath();
    ctx.arc(headX, headY, faceR, 0, Math.PI * 2);
    ctx.clip();

    if (this.heroFaceImg && this.heroFaceLoaded && this.heroFaceImg.naturalWidth > 0) {
      const iw = this.heroFaceImg.naturalWidth;
      const ih = this.heroFaceImg.naturalHeight;
      const targetSize = faceR * 2.15;
      const scale = Math.max(targetSize / iw, targetSize / ih);
      const drawW = iw * scale;
      const drawH = ih * scale;
      ctx.drawImage(
        this.heroFaceImg,
        headX - drawW / 2,
        headY - drawH * 0.48,
        drawW,
        drawH
      );
    } else {
      ctx.fillStyle = '#050505';
      ctx.fillRect(headX - faceR, headY - faceR, faceR * 2, faceR * 2);
    }
    ctx.restore();

    // Crisp outline around face portrait
    ctx.strokeStyle = '#050505';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(headX, headY, faceR, 0, Math.PI * 2);
    ctx.stroke();

    // Active aiming arm reaching to the middle of the actor's body and moving up & down
    const elbowX = (shoulderX + aimOriginX) * 0.5;
    const elbowY = Math.min(sofaY - 25, (shoulderY + aimOriginY) * 0.5 + 11);
    ctx.strokeStyle = '#050505';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(shoulderX + 3, shoulderY + 1);
    ctx.lineTo(elbowX, elbowY);
    ctx.lineTo(aimOriginX, aimOriginY);
    ctx.stroke();

    // Moving hand right at the center-body aim origin
    ctx.fillStyle = '#050505';
    ctx.beginPath();
    ctx.arc(aimOriginX, aimOriginY, 4.4, 0, Math.PI * 2);
    ctx.fill();

    // Compact glowing cyan emitter blade held in the waving hand pointing along aim angle
    const locked =
      this.lockedEnemyId !== null
        ? this.enemies.find((en) => en.id === this.lockedEnemyId) || null
        : null;
    const aimTargetX =
      this.state === 'TITLE_MENU'
        ? aimOriginX + Math.sin(this.heroBreathPhase * 0.7) * 55
        : locked
          ? locked.x
          : this.aimX;
    const aimTargetY =
      this.state === 'TITLE_MENU'
        ? aimOriginY - 115
        : locked
          ? locked.y
          : this.aimY;
    const aimAngle = Math.atan2(aimTargetY - aimOriginY, aimTargetX - aimOriginX);

    ctx.save();
    ctx.translate(aimOriginX, aimOriginY);
    ctx.rotate(aimAngle);
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00CFFF';
    ctx.strokeStyle = '#00CFFF';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(14, 0);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ECFEFF';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(13, 0);
    ctx.stroke();
    ctx.restore();

    // Subtle hand-mounted aim emitter ring
    ctx.save();
    ctx.strokeStyle = this.lockedEnemyId !== null ? '#00CFFF' : 'rgba(9, 9, 11, 0.35)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(aimOriginX, aimOriginY, 7 + kick * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#00CFFF';
    ctx.beginPath();
    ctx.arc(aimOriginX, aimOriginY, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  private drawTitlePreviewArrow(ctx: CanvasRenderingContext2D, anchor: SofaAnchor): void {
    const { aimOriginX, aimOriginY } = anchor;
    const swayX = aimOriginX + Math.sin(this.heroBreathPhase * 0.7) * 55;
    const tipY = aimOriginY - 115;

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 153, 204, 0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 7]);
    ctx.beginPath();
    ctx.moveTo(aimOriginX, aimOriginY);
    ctx.lineTo(swayX, tipY);
    ctx.stroke();

    ctx.setLineDash([]);
    const angle = Math.atan2(tipY - aimOriginY, swayX - aimOriginX);
    this.drawArrowHead(ctx, swayX, tipY, angle, 'rgba(0, 153, 204, 0.6)', 9);
    ctx.restore();
  }

  private drawAimDottedArrow(ctx: CanvasRenderingContext2D, anchor: SofaAnchor): void {
    const { aimOriginX, aimOriginY } = anchor;
    const locked =
      this.lockedEnemyId !== null
        ? this.enemies.find((en) => en.id === this.lockedEnemyId) || null
        : null;

    const tx = locked ? locked.x : this.aimX;
    const ty = locked ? locked.y : this.aimY;
    const angle = Math.atan2(ty - aimOriginY, tx - aimOriginX);

    // Stop arrow neatly at the edge of the locked target or at cursor
    const dist = Math.hypot(tx - aimOriginX, ty - aimOriginY);
    const endDist = locked ? Math.max(18, dist - 26) : dist;
    const endX = aimOriginX + Math.cos(angle) * endDist;
    const endY = aimOriginY + Math.sin(angle) * endDist;

    ctx.save();
    const color = locked ? '#0099CC' : 'rgba(9, 9, 11, 0.55)';
    ctx.strokeStyle = color;
    ctx.lineWidth = locked ? 2.4 : 2;
    ctx.lineCap = 'round';
    ctx.setLineDash([4, 7]);
    ctx.lineDashOffset = -(this.reticlePulse * 8) % 11;
    ctx.beginPath();
    ctx.moveTo(aimOriginX, aimOriginY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.setLineDash([]);
    this.drawArrowHead(ctx, endX, endY, angle, locked ? '#00CFFF' : '#09090B', locked ? 11 : 9);
    ctx.restore();
  }

  private drawArrowHead(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    color: string,
    size: number
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(size * 0.6, 0);
    ctx.lineTo(-size * 0.7, -size * 0.48);
    ctx.lineTo(-size * 0.42, 0);
    ctx.lineTo(-size * 0.7, size * 0.48);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawLockReticle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    scale: number
  ): void {
    const r = 30 * scale + Math.sin(this.reticlePulse) * 2.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = '#00B8E6';
    ctx.lineWidth = 2.2;

    // Outer target circle
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    // 4 crisp corner ticks
    ctx.setLineDash([]);
    const tick = 7;
    ctx.beginPath();
    ctx.moveTo(-r - 4, 0);
    ctx.lineTo(-r + tick, 0);
    ctx.moveTo(r + 4, 0);
    ctx.lineTo(r - tick, 0);
    ctx.moveTo(0, -r - 4);
    ctx.lineTo(0, -r + tick);
    ctx.moveTo(0, r + 4);
    ctx.lineTo(0, r - tick);
    ctx.stroke();
    ctx.restore();
  }

  private drawStickmanFigure(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    scale: number,
    color: string,
    stridePhase: number,
    lineWidth: number = 2.6
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const armSwing = Math.sin(stridePhase) * 6;
    const legSwing = Math.sin(stridePhase) * 8;

    // Slim head
    ctx.beginPath();
    ctx.arc(0, -32, 9, 0, Math.PI * 2);
    ctx.fill();

    // Slim body
    ctx.beginPath();
    ctx.moveTo(0, -23);
    ctx.lineTo(0, 18);
    ctx.stroke();

    // Slim arms
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(-20, 2 + armSwing);
    ctx.moveTo(0, -13);
    ctx.lineTo(20, 2 - armSwing);
    ctx.stroke();

    // Slim legs
    ctx.beginPath();
    ctx.moveTo(0, 18);
    ctx.lineTo(-14 - legSwing * 0.4, 41 - Math.abs(legSwing) * 0.3);
    ctx.moveTo(0, 18);
    ctx.lineTo(14 + legSwing * 0.4, 41 - Math.abs(legSwing) * 0.3);
    ctx.stroke();

    ctx.restore();
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy): void {
    const color =
      e.hitFlash > 0.2
        ? '#F59E0B'
        : e.kind === 'dasher'
          ? '#18181B'
          : e.kind === 'weaver'
            ? '#1E1B4B'
            : '#050505';

    // Dasher horizontal windup telegraph line & exclamation mark
    if (e.kind === 'dasher' && e.dashState === 'windup') {
      ctx.save();
      ctx.strokeStyle = 'rgba(225, 29, 72, 0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + e.dirX * 140, e.y);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = '#E11D48';
      ctx.font = '800 16px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', e.x, e.y - 58);
      ctx.restore();
    }

    // Brute armor shield diamond (2 HP)
    if (e.kind === 'brute' && e.hp > 1) {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.strokeStyle = '#D97706';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, -44);
      ctx.lineTo(30, 0);
      ctx.lineTo(0, 44);
      ctx.lineTo(-30, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    const enemyStroke = e.kind === 'brute' ? 3.8 : 2.6;

    // White halo so slim stickmen remain crisp over any text
    this.drawStickmanFigure(ctx, e.x, e.y, e.scale, '#FFFFFF', e.phase, enemyStroke + 3);
    this.drawStickmanFigure(ctx, e.x, e.y, e.scale, color, e.phase, enemyStroke);

    // Distinct colored headband cue per enemy type
    if (e.kind === 'dasher') {
      ctx.fillStyle = '#E11D48';
      ctx.fillRect(e.x - 8 * e.scale, e.y - 34 * e.scale, 16 * e.scale, 3);
    } else if (e.kind === 'weaver') {
      ctx.fillStyle = '#7C3AED';
      ctx.fillRect(e.x - 8 * e.scale, e.y - 34 * e.scale, 16 * e.scale, 3);
    }

    // Sequential enemy number cleanly above slim head with white halo
    ctx.save();
    ctx.font = '700 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelY = e.y - 47 * e.scale;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#FFFFFF';
    ctx.strokeText(String(e.number), e.x, labelY);
    ctx.fillStyle = '#09090B';
    ctx.fillText(String(e.number), e.x, labelY);
    ctx.restore();

    // Subtle speaking indicator waves next to enemy head while its voice plays
    if (soundSynth.getSpeakingEnemyId() === e.id) {
      const headY = e.y - 32 * e.scale;
      const pulse = (Math.sin(this.reticlePulse * 2.2) + 1) * 0.5;
      ctx.save();
      ctx.strokeStyle = '#0099CC';
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      for (let wIdx = 0; wIdx < 2; wIdx++) {
        const r = (12 + wIdx * 6 + pulse * 2.5) * e.scale;
        ctx.globalAlpha = 0.85 - wIdx * 0.3;
        ctx.beginPath();
        if (e.dirX === 1) {
          ctx.arc(e.x + 8 * e.scale, headY, r, -0.55, 0.55);
        } else {
          ctx.arc(e.x - 8 * e.scale, headY, r, Math.PI - 0.55, Math.PI + 0.55);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
