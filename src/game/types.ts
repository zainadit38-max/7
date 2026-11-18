export type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type GameMode = 'classic' | 'blitz' | 'zen';

export type EnemyKind = 'runner' | 'dasher' | 'brute' | 'weaver';

export interface Enemy {
  id: number;
  number: number;
  kind: EnemyKind;
  x: number;
  y: number;
  baseY: number;
  dirX: 1 | -1;
  vx: number;
  vy: number;
  speed: number;
  scale: number;
  hp: number;
  maxHp: number;
  phase: number;
  hitFlash: number;
  // Dasher telegraph state
  dashState: 'approach' | 'windup' | 'dashing';
  dashTimer: number;
  dashDirX: number;
  dashDirY: number;
  // Weaver perpendicular oscillation
  perpSign: number;
  // Voice line assignment
  voiceIndex: number;
  hasSpoken: boolean;
}

export interface Bullet {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  targetId: number | null;
  life: number;
}

export type ParticleKind = 'spark' | 'ember' | 'shard';

export interface Particle {
  active: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  drag: number;
  gravity: number;
  glow: boolean;
}

export interface SlashArc {
  x: number;
  y: number;
  angle: number;
  radius: number;
  life: number;
  maxLife: number;
  color: string;
  fromX: number;
  fromY: number;
}

export interface ShockwaveRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
  lineWidth: number;
}

export interface FloatingText {
  x: number;
  y: number;
  vx?: number;
  vy: number;
  text: string;
  subText?: string;
  color: string;
  glowColor?: string;
  life: number;
  maxLife: number;
  scale: number;
  isCombo?: boolean;
  tilt?: number;
}

export interface Afterimage {
  x: number;
  y: number;
  scale: number;
  alpha: number;
  facing: number;
}

export interface RunStats {
  score: number;
  highScore: number;
  isNewBest: boolean;
  level: number;
  kills: number;
  bestCombo: number;
  mode: GameMode;
}

export interface HudSnapshot {
  state: GameState;
  mode: GameMode;
  score: number;
  highScore: number;
  level: number;
  lives: number;
  maxLives: number;
  combo: number;
  kills: number;
  novaCharge: number; // 0 to 100
  muted: boolean;
  runStats: RunStats | null;
}
