import React from 'react';

const BANNER_PHOTO_URL = '/assets/aistudio/IMG_20261118_122241_1bff395c.png';

export const TitleLockup: React.FC = () => {
  return (
    <div className="flex flex-col items-center select-none text-center w-full max-w-[520px]">
      {/* Top Game Banner featuring actor photo & 7 KAROD title */}
      <div className="w-full rounded-xl border border-[#09090B]/15 bg-[#FAF9F6] shadow-sm overflow-hidden">
        <div className="flex items-center gap-4 sm:gap-5 px-4 py-3 sm:px-5 sm:py-3.5">
          {/* Framed banner portrait */}
          <div className="relative w-16 h-20 sm:w-20 sm:h-24 rounded-lg overflow-hidden border-2 border-[#09090B] shrink-0 bg-[#18181B]">
            <img
              src={BANNER_PHOTO_URL}
              alt="7 Karod Banner"
              className="w-full h-full object-cover object-top"
            />
            <div className="absolute inset-x-0 bottom-0 h-1 bg-[#00CFFF]" />
          </div>

          {/* 7 KAROD display title & cyan slash */}
          <div className="flex-1 flex flex-col items-start text-left min-w-0">
            <span className="text-[11px] sm:text-xs font-bold tracking-[0.22em] uppercase text-[#52525B]">
              Official Game
            </span>
            <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-[#09090B] leading-none mt-0.5">
              7 KAROD
            </h1>
            <svg
              viewBox="0 0 260 16"
              className="w-full max-w-[230px] h-auto mt-1.5 overflow-visible"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="bladeSlashGrad" x1="0%" y1="50%" x2="100%" y2="50%">
                  <stop offset="0%" stopColor="#00CFFF" stopOpacity="0.95" />
                  <stop offset="65%" stopColor="#0099CC" stopOpacity="1" />
                  <stop offset="100%" stopColor="#00CFFF" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M 0 10 Q 120 2 252 11"
                fill="none"
                stroke="url(#bladeSlashGrad)"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M 10 8.5 Q 120 3.5 210 9.5"
                fill="none"
                stroke="#FFFFFF"
                strokeOpacity="0.85"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export const TopGameBanner: React.FC = () => (
  <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-[#09090B]/15 bg-[#FAF9F6]/95 shadow-xs select-none">
    <div className="w-7 h-7 rounded-md overflow-hidden border border-[#09090B] shrink-0 bg-[#18181B]">
      <img
        src={BANNER_PHOTO_URL}
        alt="7 Karod"
        className="w-full h-full object-cover object-top"
      />
    </div>
    <span className="font-display text-sm sm:text-base font-extrabold tracking-wider text-[#09090B] leading-none whitespace-nowrap">
      7 KAROD
    </span>
    <span className="w-1.5 h-4 rounded-xs bg-[#00CFFF]" aria-hidden="true" />
  </div>
);

export const ShurikenHeartIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    className="shrink-0 transition-transform duration-150"
  >
    <path
      d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
      fill={active ? '#E11D48' : 'transparent'}
      stroke={active ? '#E11D48' : '#A1A1AA'}
      strokeWidth="2"
    />
  </svg>
);

export const BladeIcon: React.FC<{ charged: boolean }> = ({ charged }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    className="shrink-0"
  >
    <path
      d="M20 4L9.5 14.5M9.5 14.5L6 18M9.5 14.5L11.5 16.5M7 13L11 17M4 20L6 18"
      stroke={charged ? '#0099CC' : '#52525B'}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
