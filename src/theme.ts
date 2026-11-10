import { ThemePalette } from './types';

const PALETTES: ThemePalette[] = [
  { bg: '#0c0a09', fg: '#f8fafc', accent: '#d4a853', glass: 'rgba(20, 17, 13, 0.72)' },
  { bg: '#090d16', fg: '#f8fafc', accent: '#c9a259', glass: 'rgba(13, 19, 32, 0.72)' },
  { bg: '#0f0b14', fg: '#f8fafc', accent: '#d9aa5f', glass: 'rgba(22, 16, 29, 0.72)' },
  { bg: '#0a1210', fg: '#f8fafc', accent: '#cca352', glass: 'rgba(14, 24, 21, 0.72)' },
  { bg: '#130c0c', fg: '#f8fafc', accent: '#deb062', glass: 'rgba(26, 16, 16, 0.72)' }
];

const paletteCache = new Map<string, ThemePalette>();

export function applyPalette(p: ThemePalette): void {
  const root = document.documentElement;
  root.style.setProperty('--bg', p.bg);
  root.style.setProperty('--fg', p.fg);
  root.style.setProperty('--accent', p.accent);
  root.style.setProperty('--glass', p.glass);
}

export async function applyThemeFromCover(coverUrl: string | undefined, fallbackIdx = 0): Promise<ThemePalette> {
  const key = coverUrl || `idx-${fallbackIdx}`;
  const cached = paletteCache.get(key);
  if (cached) {
    applyPalette(cached);
    return cached;
  }

  let hash = fallbackIdx;
  if (coverUrl) {
    for (let i = 0; i < coverUrl.length; i++) {
      hash = (hash * 31 + coverUrl.charCodeAt(i)) >>> 0;
    }
  }
  const chosen = PALETTES[hash % PALETTES.length];
  paletteCache.set(key, chosen);
  applyPalette(chosen);
  return chosen;
}
