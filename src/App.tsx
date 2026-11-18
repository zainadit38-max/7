import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { BladeIcon, ShurikenHeartIcon, TitleLockup, TopGameBanner } from './components/TitleLockup';
import { NinjaGameEngine } from './game/engine';
import { GameMode, HudSnapshot } from './game/types';

const INITIAL_HUD: HudSnapshot = {
  state: 'TITLE_MENU',
  mode: 'classic',
  score: 0,
  highScore: 0,
  level: 1,
  lives: 1,
  maxLives: 1,
  combo: 0,
  kills: 0,
  novaCharge: 40,
  muted: false,
  runStats: null,
};

const MODE_OPTIONS: { id: GameMode; label: string; hint: string }[] = [
  { id: 'classic', label: 'Classic', hint: '1 Miss Game Over · Shoot overhead targets before they escape' },
  { id: 'blitz', label: 'Blitz', hint: '1 Miss Game Over · Faster waves and rapid targets' },
  { id: 'zen', label: 'Zen', hint: 'No Game Over · Endless relaxed target shooting' },
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<NinjaGameEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new NinjaGameEngine(canvas, (snapshot) => {
      setHud(snapshot);
    });
    engineRef.current = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const selectedModeMeta = MODE_OPTIONS.find((m) => m.id === hud.mode) || MODE_OPTIONS[0];
  const novaReady = hud.novaCharge >= 100;

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-white text-[#09090B]">
      {/* Isolated 60fps Canvas Viewport */}
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-crosshair touch-none"
        aria-label="7 Karod playfield"
      />

      {/* TITLE SCREEN OVERLAY */}
      {hud.state === 'TITLE_MENU' && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between px-4 sm:px-6 py-4 sm:py-7">
          {/* Top-right sound button */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => engineRef.current?.toggleMute()}
              className="pointer-events-auto inline-flex items-center justify-center w-11 h-11 rounded-lg border border-[#09090B]/12 bg-white/90 text-[#09090B] hover:border-[#09090B]/30 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0099CC]"
              aria-label={hud.muted ? 'Unmute audio' : 'Mute audio'}
              title={hud.muted ? 'Unmute audio (M)' : 'Mute audio (M)'}
            >
              {hud.muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
          </div>

          {/* Upper calm negative space: Top Game Banner (7 KAROD) & Mode Selector */}
          <div className="flex flex-col items-center gap-3.5 -mt-6 sm:-mt-10">
            <TitleLockup />

            {/* Segmented Mode Selector */}
            <div
              className="pointer-events-auto inline-flex items-center gap-1 p-1 rounded-lg bg-[#09090B]/[0.05] border border-[#09090B]/10"
              role="group"
              aria-label="Game mode"
            >
              {MODE_OPTIONS.map((option) => {
                const active = hud.mode === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => engineRef.current?.setMode(option.id)}
                    className={`min-h-[40px] px-4 py-1.5 text-sm font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0099CC] ${
                      active
                        ? 'bg-[#09090B] text-white'
                        : 'text-[#52525B] hover:text-[#09090B]'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-xs sm:text-sm text-[#52525B]">
              <span>{selectedModeMeta.hint}</span>
              {hud.highScore > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-num font-bold text-[#09090B]">
                    Best {hud.highScore}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Middle space left intentionally open for centered ZAIN emblem */}
          <div className="flex-1 min-h-[120px] sm:min-h-[150px]" aria-hidden="true" />

          {/* Lower action cluster positioned cleanly above the bottom sofa */}
          <div className="flex flex-col items-center gap-2.5 pb-24 sm:pb-28">
            <button
              type="button"
              onClick={() => engineRef.current?.startGame(hud.mode)}
              className="pointer-events-auto min-h-[48px] px-9 py-3 rounded-lg bg-[#09090B] text-white font-display text-base font-bold tracking-wide hover:bg-[#18181B] active:scale-[0.98] transition-all whitespace-nowrap shrink-0 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0099CC]"
            >
              Start Game
            </button>
            <p className="text-xs sm:text-sm text-[#52525B] text-center tracking-wide">
              Aim Dotted Arrow & Click or Tap to Shoot · Space Blade Nova · Esc Pause
            </p>
          </div>
        </div>
      )}

      {/* ACTIVE GAMEPLAY HUD (Low-occlusion perimeter, pointer-events-none wrapper) */}
      {(hud.state === 'PLAYING' || hud.state === 'PAUSED') && (
        <header className="pointer-events-none absolute top-0 left-0 right-0 flex flex-col gap-2 px-4 py-2.5 sm:px-7 sm:py-4">
          {/* Mobile top centered banner */}
          <div className="flex sm:hidden justify-center">
            <TopGameBanner />
          </div>

          <div className="flex items-start justify-between gap-4">
            {/* Top-left Score, Level & Lives cluster */}
            <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[#09090B]">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs font-semibold tracking-wider uppercase text-[#52525B]">
                  Score
                </span>
                <span className="font-mono-num text-2xl sm:text-3xl font-bold leading-none">
                  {hud.score}
                </span>
              </div>

              <span className="text-[#09090B]/25" aria-hidden="true">
                /
              </span>

              <div className="flex items-baseline gap-1.5">
                <span className="text-xs font-semibold tracking-wider uppercase text-[#52525B]">
                  Level
                </span>
                <span className="font-mono-num text-lg sm:text-xl font-bold leading-none">
                  {hud.level}
                </span>
              </div>

              {hud.highScore > 0 && (
                <>
                  <span className="hidden sm:inline text-[#09090B]/25" aria-hidden="true">
                    ·
                  </span>
                  <span className="hidden sm:inline font-mono-num text-xs font-semibold text-[#52525B]">
                    Best {hud.highScore}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              {hud.mode === 'zen' ? (
                <span className="text-xs font-semibold text-[#52525B]">Zen Mode</span>
              ) : (
                <div className="flex items-center gap-1.5" aria-label="1-Hit Guard Active">
                  <ShurikenHeartIcon active={hud.lives > 0} />
                  <span className="ml-0.5 text-xs font-semibold text-[#52525B]">
                    Guard Active
                  </span>
                </div>
              )}

              {hud.combo >= 2 && (
                <>
                  <span className="text-[#09090B]/25" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono-num text-xs font-bold text-[#0088B8]">
                    ×{hud.combo} Combo
                  </span>
                </>
              )}
            </div>
          </div>

            {/* Desktop/Tablet centered top banner */}
            <div className="hidden sm:flex justify-center">
              <TopGameBanner />
            </div>

            {/* Top-right Utility & Blade Nova Controls */}
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => engineRef.current?.triggerNova()}
                disabled={!novaReady}
                className={`inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-lg border text-xs font-bold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0099CC] ${
                  novaReady
                    ? 'bg-[#00CFFF] border-[#0099CC] text-[#09090B] hover:bg-[#33DAFF] cursor-pointer'
                    : 'bg-white/90 border-[#09090B]/12 text-[#52525B] cursor-default'
                }`}
                title={novaReady ? 'Trigger Blade Nova (Space)' : 'Charge Blade Nova by slicing enemies'}
              >
                <BladeIcon charged={novaReady} />
                <span className="font-mono-num">
                  {novaReady ? 'Nova Ready' : `Nova ${hud.novaCharge}%`}
                </span>
              </button>

              <button
                type="button"
                onClick={() => engineRef.current?.toggleMute()}
                className="inline-flex items-center justify-center w-11 h-11 rounded-lg border border-[#09090B]/12 bg-white/90 text-[#09090B] hover:border-[#09090B]/30 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0099CC]"
                aria-label={hud.muted ? 'Unmute audio' : 'Mute audio'}
                title={hud.muted ? 'Unmute audio (M)' : 'Mute audio (M)'}
              >
                {hud.muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>

              <button
                type="button"
                onClick={() =>
                  hud.state === 'PAUSED'
                    ? engineRef.current?.resumeGame()
                    : engineRef.current?.pauseGame()
                }
                className="inline-flex items-center justify-center w-11 h-11 rounded-lg border border-[#09090B]/12 bg-white/90 text-[#09090B] hover:border-[#09090B]/30 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0099CC]"
                aria-label={hud.state === 'PAUSED' ? 'Resume game' : 'Pause game'}
                title={hud.state === 'PAUSED' ? 'Resume (Esc)' : 'Pause (Esc)'}
              >
                {hud.state === 'PAUSED' ? (
                  <Play className="w-5 h-5" />
                ) : (
                  <Pause className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </header>
      )}

      {/* PAUSE MODAL */}
      {hud.state === 'PAUSED' && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-[#09090B]/35 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-title"
        >
          <div className="w-full max-w-sm rounded-xl bg-[#FAF9F6] border border-[#09090B]/15 p-6 shadow-lg flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <h2 id="pause-title" className="font-display text-2xl font-bold text-[#09090B]">
                Paused
              </h2>
              <p className="text-sm text-[#52525B] font-mono-num">
                Score {hud.score} · Level {hud.level}
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => engineRef.current?.resumeGame()}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-lg bg-[#09090B] text-white font-semibold text-sm hover:bg-[#18181B] transition-colors whitespace-nowrap"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={() => engineRef.current?.startGame(hud.mode)}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-lg border border-[#09090B]/15 bg-white text-[#09090B] font-semibold text-sm hover:border-[#09090B]/35 transition-colors whitespace-nowrap"
              >
                Restart
              </button>
              <button
                type="button"
                onClick={() => engineRef.current?.quitToTitle()}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-lg text-[#52525B] font-semibold text-sm hover:text-[#09090B] hover:bg-[#09090B]/[0.04] transition-colors whitespace-nowrap"
              >
                Back to Title
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GAME OVER MODAL */}
      {hud.state === 'GAME_OVER' && hud.runStats && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-[#09090B]/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gameover-title"
        >
          <div className="w-full max-w-md rounded-xl bg-[#FAF9F6] border border-[#09090B]/15 p-6 sm:p-7 shadow-lg flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <h2 id="gameover-title" className="font-display text-2xl font-bold text-[#09090B]">
                  Guard Breached
                </h2>
                {hud.runStats.isNewBest && (
                  <span className="text-xs font-bold text-[#0088B8]">New Best</span>
                )}
              </div>
              <p className="text-sm text-[#52525B] capitalize">
                {hud.runStats.mode} Mode · Level {hud.runStats.level}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 py-4 border-y border-[#09090B]/10">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-[#52525B]">Final Score</span>
                <span className="font-mono-num text-3xl font-bold text-[#09090B]">
                  {hud.runStats.score}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-[#52525B]">Best Score</span>
                <span className="font-mono-num text-3xl font-bold text-[#09090B]">
                  {hud.runStats.highScore}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-[#52525B]">Enemies Sliced</span>
                <span className="font-mono-num text-lg font-bold text-[#09090B]">
                  {hud.runStats.kills}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-[#52525B]">Best Combo</span>
                <span className="font-mono-num text-lg font-bold text-[#09090B]">
                  ×{Math.max(1, hud.runStats.bestCombo)}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => engineRef.current?.startGame(hud.mode)}
                className="flex-1 inline-flex items-center justify-center gap-2 min-h-[46px] px-5 py-2.5 rounded-lg bg-[#09090B] text-white font-semibold text-sm hover:bg-[#18181B] transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Play Again</span>
              </button>
              <button
                type="button"
                onClick={() => engineRef.current?.quitToTitle()}
                className="min-h-[46px] px-5 py-2.5 rounded-lg border border-[#09090B]/15 bg-white text-[#09090B] font-semibold text-sm hover:border-[#09090B]/35 transition-colors whitespace-nowrap"
              >
                Title Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
