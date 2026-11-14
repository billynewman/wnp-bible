import { ThemePalette } from './types';

const PALETTES: ThemePalette[] = [
  {
    bg: '#0a090c',
    fg: '#f8fafc',
    accent: '#d4a853',
    accent2: '#c86d51',
    glass: 'rgba(20, 17, 16, 0.58)',
    glowA: 'rgba(212, 168, 83, 0.26)',
    glowB: 'rgba(180, 88, 72, 0.20)'
  },
  {
    bg: '#070b14',
    fg: '#f8fafc',
    accent: '#78b4ff',
    accent2: '#c9a259',
    glass: 'rgba(13, 19, 34, 0.58)',
    glowA: 'rgba(72, 138, 255, 0.24)',
    glowB: 'rgba(201, 162, 89, 0.18)'
  },
  {
    bg: '#0c0914',
    fg: '#f8fafc',
    accent: '#b388eb',
    accent2: '#deb062',
    glass: 'rgba(20, 15, 31, 0.58)',
    glowA: 'rgba(155, 108, 235, 0.24)',
    glowB: 'rgba(222, 176, 98, 0.18)'
  },
  {
    bg: '#07110f',
    fg: '#f8fafc',
    accent: '#5ec2a4',
    accent2: '#d4a853',
    glass: 'rgba(12, 24, 21, 0.58)',
    glowA: 'rgba(72, 186, 154, 0.22)',
    glowB: 'rgba(212, 168, 83, 0.18)'
  },
  {
    bg: '#12090d',
    fg: '#f8fafc',
    accent: '#e28b97',
    accent2: '#8da4ef',
    glass: 'rgba(26, 14, 19, 0.58)',
    glowA: 'rgba(214, 104, 128, 0.23)',
    glowB: 'rgba(120, 148, 240, 0.19)'
  }
];

const paletteCache = new Map<string, ThemePalette>();

export function applyPalette(p: ThemePalette): void {
  const root = document.documentElement;
  root.style.setProperty('--bg', p.bg);
  root.style.setProperty('--fg', p.fg);
  root.style.setProperty('--accent', p.accent);
  root.style.setProperty('--accent-2', p.accent2);
  root.style.setProperty('--glass', p.glass);
  root.style.setProperty('--glow-a', p.glowA);
  root.style.setProperty('--glow-b', p.glowB);
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
