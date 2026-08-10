import type { ThemeMode } from '../../theme/theme';

/**
 * Time-of-day Chinese-landscape scenes revealed on hover in the theme popover.
 * Sun/moon trace a day arc: dawn low-left → noon high-centre → dusk low-right →
 * night moon high-centre. Mirrors the four `.art` SVGs in design-vite.
 */
export function ThemeScene({ theme }: { theme: ThemeMode }): React.JSX.Element | null {
  switch (theme) {
    case 'warm':
      return (
        <svg viewBox="0 0 240 48" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="aw-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffe6d0" />
              <stop offset="1" stopColor="#fff6ee" />
            </linearGradient>
            <radialGradient id="aw-sun" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#ffab5e" />
              <stop offset=".55" stopColor="#ffc987" />
              <stop offset="1" stopColor="#ffc987" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="240" height="48" fill="url(#aw-sky)" />
          <circle cx="130" cy="33" r="19" fill="url(#aw-sun)" />
          <circle cx="130" cy="33" r="8" fill="#ff8a3a" />
          <path d="M60 33 96 21 132 32 172 24 210 31 240 26 240 48 60 48Z" fill="#a982a8" opacity=".62" />
          <path d="M60 40 104 29 150 38 196 30 240 36 240 48 60 48Z" fill="#8a6690" opacity=".78" />
          <ellipse cx="150" cy="36" rx="70" ry="3.5" fill="#fff" opacity=".5" />
          <rect y="40" width="240" height="8" fill="#ffeede" opacity=".8" />
          <line x1="70" y1="44" x2="120" y2="44" stroke="#ff9a5a" strokeWidth=".9" opacity=".5" />
          <path d="M198 43q6 4 12 0" fill="none" stroke="#6f5568" strokeWidth="1.5" />
          <line x1="204" y1="43" x2="204" y2="37.5" stroke="#6f5568" strokeWidth="1" />
        </svg>
      );
    case 'light':
      return (
        <svg viewBox="0 0 240 48" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="al-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#a6d8f2" />
              <stop offset="1" stopColor="#e6f6ff" />
            </linearGradient>
            <radialGradient id="al-sun" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#fff3c0" />
              <stop offset=".55" stopColor="#ffe066" />
              <stop offset="1" stopColor="#ffe066" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="240" height="48" fill="url(#al-sky)" />
          <circle cx="155" cy="13" r="16" fill="url(#al-sun)" />
          <circle cx="155" cy="13" r="6.5" fill="#ffd84a" />
          <path d="M58 36 98 22 138 34 178 21 218 33 240 28 240 48 58 48Z" fill="#7bbf94" opacity=".62" />
          <path d="M58 42 102 30 150 40 198 30 240 37 240 48 58 48Z" fill="#4f9d6e" opacity=".82" />
          <rect y="42" width="240" height="6" fill="#c8ecff" opacity=".82" />
          <line x1="150" y1="45" x2="200" y2="45" stroke="#fff" strokeWidth=".8" opacity=".65" />
          <path d="M196 44q6 4 12 0" fill="none" stroke="#3f7a5a" strokeWidth="1.5" />
          <line x1="202" y1="44" x2="202" y2="38.5" stroke="#3f7a5a" strokeWidth="1" />
        </svg>
      );
    case 'ember':
      return (
        <svg viewBox="0 0 240 48" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="ae-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ff5a3a" />
              <stop offset=".5" stopColor="#ff8a52" />
              <stop offset="1" stopColor="#ffc07a" />
            </linearGradient>
            <radialGradient id="ae-sun" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#ff3a1a" />
              <stop offset=".55" stopColor="#ff6a38" />
              <stop offset="1" stopColor="#ff6a38" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="240" height="48" fill="url(#ae-sky)" />
          <circle cx="178" cy="30" r="21" fill="url(#ae-sun)" />
          <circle cx="178" cy="30" r="9.5" fill="#ff3818" />
          <path d="M50 35 92 24 134 34 176 25 216 33 240 29 240 48 50 48Z" fill="#7a3340" opacity=".6" />
          <path d="M50 41 96 30 146 39 196 29 240 36 240 48 50 48Z" fill="#4a2030" opacity=".82" />
          <rect y="41" width="240" height="7" fill="#ff9a5a" opacity=".55" />
          <line x1="150" y1="45" x2="200" y2="45" stroke="#ff5a2a" strokeWidth="1" opacity=".6" />
          <path d="M96 44q6 4 12 0" fill="none" stroke="#2a1420" strokeWidth="1.5" />
          <line x1="102" y1="44" x2="102" y2="38.5" stroke="#2a1420" strokeWidth="1" />
        </svg>
      );
    case 'dark':
      return (
        <svg viewBox="0 0 240 48" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="an-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#121a38" />
              <stop offset="1" stopColor="#34486e" />
            </linearGradient>
            <radialGradient id="an-moon" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#fff" />
              <stop offset=".5" stopColor="#eef4ff" />
              <stop offset="1" stopColor="#eef4ff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="240" height="48" fill="url(#an-sky)" />
          <circle cx="155" cy="14" r="14" fill="url(#an-moon)" />
          <circle cx="155" cy="14" r="7" fill="#f4f8ff" />
          <circle cx="58" cy="12" r=".9" fill="#fff" opacity=".8" />
          <circle cx="92" cy="22" r=".7" fill="#fff" opacity=".55" />
          <circle cx="116" cy="10" r=".8" fill="#fff" opacity=".7" />
          <circle cx="210" cy="24" r=".7" fill="#fff" opacity=".6" />
          <path d="M50 35 92 23 134 34 176 24 216 32 240 28 240 48 50 48Z" fill="#26355c" opacity=".9" />
          <path d="M50 41 96 30 146 39 196 29 240 36 240 48 50 48Z" fill="#141e3a" />
          <rect y="41" width="240" height="7" fill="#2a3c60" opacity=".7" />
          <line x1="139" y1="45" x2="171" y2="45" stroke="#eef4ff" strokeWidth=".9" opacity=".5" />
          <path d="M182 44q6 4 12 0" fill="none" stroke="#0a1024" strokeWidth="1.5" />
          <line x1="188" y1="44" x2="188" y2="38.5" stroke="#0a1024" strokeWidth="1" />
        </svg>
      );
    default:
      return null;
  }
}
