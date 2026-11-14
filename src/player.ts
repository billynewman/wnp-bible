import { Episode, WatchProgress } from './types';
import { formatTimecode } from './autolink';

export const HISTORY_STORAGE_KEY = 'wnp-bible-history-v1';

export function readWatchHistory(): WatchProgress[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveWatchProgress(ep: Episode, seconds = 0, chapterLabel?: string): void {
  try {
    const list = readWatchHistory().filter((item) => item.episodeId !== ep.id);
    const matchedChapter =
      chapterLabel ||
      findChapterForSeconds(ep, seconds)?.label ||
      (ep.chapters[0]?.label ?? ep.bookName);
    const entry: WatchProgress = {
      episodeId: ep.id,
      bookNum: ep.bookNum,
      bookName: ep.bookName,
      youtubeId: ep.youtubeId,
      seconds: Math.max(0, Math.floor(seconds)),
      chapterLabel: matchedChapter,
      updatedAt: Date.now()
    };
    list.unshift(entry);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(list.slice(0, 30)));
    window.dispatchEvent(new CustomEvent('wnp:history-updated', { detail: entry }));
  } catch {
    // ignore storage errors
  }
}

export function findChapterForSeconds(ep: Episode, seconds: number) {
  if (!ep.chapters || ep.chapters.length === 0) return undefined;
  let current = ep.chapters[0];
  for (const ch of ep.chapters) {
    if (ch.seconds <= seconds) {
      current = ch;
    } else {
      break;
    }
  }
  return current;
}

export class BiblePlayer {
  private activeEpisode: Episode | null = null;
  private activeCardEl: HTMLElement | null = null;
  private activeIframe: HTMLIFrameElement | null = null;
  private currentStartSec = 0;
  private isPlaying = false;
  private fsListenersBound = false;

  constructor() {
    this.bindFullscreenListeners();
  }

  private bindFullscreenListeners(): void {
    if (this.fsListenersBound || typeof document === 'undefined') return;
    this.fsListenersBound = true;
    const onFsChange = () => {
      if (!this.isFullscreenActive()) {
        window.dispatchEvent(new CustomEvent('wnp:fullscreen-exit'));
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
  }

  public isFullscreenActive(): boolean {
    if (typeof document === 'undefined') return false;
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    return Boolean(
      doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        document.body?.classList.contains('has-theater-fullscreen')
    );
  }

  public get currentEpisode(): Episode | null {
    return this.activeEpisode;
  }

  public get playing(): boolean {
    return this.isPlaying;
  }

  public get currentSeconds(): number {
    return this.currentStartSec;
  }

  /**
   * Called when vertical deck snaps to a card. Sets metadata/mini-player and unmounts any stale iframe
   * on off-screen cards so only a single YouTube iframe exists at a time.
   * Never unmounts an active fullscreen video during rotation or layout resizes.
   */
  public syncCardFocus(cardEl: HTMLElement, ep: Episode): void {
    if (this.isFullscreenActive()) {
      return;
    }
    if (this.activeCardEl && this.activeCardEl !== cardEl) {
      this.unmountCardIframe(this.activeCardEl);
    }
    this.activeCardEl = cardEl;
    this.activeEpisode = ep;
    this.updateMiniPlayer(ep, this.currentStartSec);
  }

  /**
   * Mounts (or updates) the 16:9 horizontal YouTube iframe inside the card's `.youtube-stage-wrap`.
   */
  public playYoutube(cardEl: HTMLElement, ep: Episode, startSec = 0, chapterLabel?: string): void {
    if (this.activeCardEl && this.activeCardEl !== cardEl) {
      this.unmountCardIframe(this.activeCardEl);
    }

    this.activeCardEl = cardEl;
    this.activeEpisode = ep;
    this.currentStartSec = Math.max(0, Math.floor(startSec));
    this.isPlaying = true;

    // Ensure card is scrolled to Slide 1 (the video stage slide)
    const slidesEl = cardEl.querySelector<HTMLElement>('.slides');
    if (slidesEl && slidesEl.scrollLeft > 20) {
      slidesEl.scrollTo({ left: 0, behavior: 'smooth' });
    }

    const stageWrap = cardEl.querySelector<HTMLElement>('.youtube-stage-wrap');
    if (!stageWrap) return;

    const existingIframe = stageWrap.querySelector<HTMLIFrameElement>('iframe.youtube-embed');
    if (existingIframe && existingIframe.dataset.ytid === ep.youtubeId) {
      // Seek immediately via YouTube IFrame postMessage API, and also update src if postMessage isn't ready
      try {
        existingIframe.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'seekTo', args: [this.currentStartSec, true] }),
          '*'
        );
        existingIframe.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
          '*'
        );
      } catch {
        existingIframe.src = this.buildEmbedUrl(ep.youtubeId, this.currentStartSec, true);
      }
      this.activeIframe = existingIframe;
    } else {
      const iframe = document.createElement('iframe');
      iframe.className = 'youtube-embed';
      iframe.dataset.ytid = ep.youtubeId;
      iframe.title = ep.ytTitle || ep.title;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';
      iframe.allowFullscreen = true;
      iframe.setAttribute('webkitallowfullscreen', 'true');
      iframe.src = this.buildEmbedUrl(ep.youtubeId, this.currentStartSec, true);

      const posterBtn = stageWrap.querySelector<HTMLElement>('.yt-poster-trigger');
      if (posterBtn) posterBtn.hidden = true;

      stageWrap.appendChild(iframe);
      this.activeIframe = iframe;
    }

    stageWrap.classList.add('is-playing');
    this.updateCardButtons(cardEl, true);
    this.highlightActiveChapter(cardEl, ep, this.currentStartSec);
    saveWatchProgress(ep, this.currentStartSec, chapterLabel);
    this.updateMiniPlayer(ep, this.currentStartSec, chapterLabel);
  }

  /**
   * Push horizontal YouTube video to Fullscreen.
   * Mounts the video iframe if not yet playing, then requests native Fullscreen on the video stage
   * (or toggles in-app Theater Fullscreen mode on iOS/browsers that restrict iframe fullscreen).
   */
  public async toggleFullscreen(cardEl: HTMLElement, ep: Episode): Promise<void> {
    const stageWrap = cardEl.querySelector<HTMLElement>('.youtube-stage-wrap');
    if (!stageWrap) return;

    // Ensure the YouTube iframe is mounted and playing before entering fullscreen
    if (!stageWrap.classList.contains('is-playing')) {
      const saved = readWatchHistory().find((h) => h.episodeId === ep.id);
      this.playYoutube(cardEl, ep, saved?.seconds || 0, saved?.chapterLabel);
    }

    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void>;
    };

    // If already in native fullscreen, exit
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      if (doc.exitFullscreen) {
        await doc.exitFullscreen().catch(() => {});
      } else if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen().catch(() => {});
      }
      stageWrap.classList.remove('is-theater-fullscreen');
      document.body.classList.remove('has-theater-fullscreen');
      return;
    }

    // If already in fallback theater fullscreen, exit
    if (stageWrap.classList.contains('is-theater-fullscreen')) {
      stageWrap.classList.remove('is-theater-fullscreen');
      document.body.classList.remove('has-theater-fullscreen');
      window.dispatchEvent(new CustomEvent('wnp:fullscreen-exit'));
      return;
    }

    // Try native Fullscreen API on the stage wrapper (includes the Exit Fullscreen overlay button)
    const targetEl = stageWrap as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };

    try {
      if (targetEl.requestFullscreen) {
        await targetEl.requestFullscreen();
        return;
      }
      if (targetEl.webkitRequestFullscreen) {
        await targetEl.webkitRequestFullscreen();
        return;
      }
    } catch {
      // Fallback to in-app full-viewport theater mode (e.g., iOS Safari)
    }

    stageWrap.classList.add('is-theater-fullscreen');
    document.body.classList.add('has-theater-fullscreen');
  }

  public stopCardVideo(cardEl: HTMLElement): void {
    this.unmountCardIframe(cardEl);
    this.isPlaying = false;
    this.updateCardButtons(cardEl, false);
  }

  private unmountCardIframe(cardEl: HTMLElement): void {
    const stageWrap = cardEl.querySelector<HTMLElement>('.youtube-stage-wrap');
    if (!stageWrap) return;
    stageWrap.classList.remove('is-playing', 'is-theater-fullscreen');
    document.body.classList.remove('has-theater-fullscreen');
    const iframe = stageWrap.querySelector('iframe.youtube-embed');
    if (iframe) iframe.remove();
    const posterBtn = stageWrap.querySelector<HTMLElement>('.yt-poster-trigger');
    if (posterBtn) posterBtn.hidden = false;
    this.updateCardButtons(cardEl, false);
    if (this.activeCardEl === cardEl) {
      this.activeIframe = null;
      this.isPlaying = false;
    }
  }

  private buildEmbedUrl(youtubeId: string, startSec = 0, autoplay = true): string {
    const params = new URLSearchParams({
      autoplay: autoplay ? '1' : '0',
      playsinline: '1',
      enablejsapi: '1',
      rel: '0',
      modestbranding: '1',
      fs: '1'
    });
    if (startSec > 0) {
      params.set('start', String(Math.floor(startSec)));
    }
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?${params.toString()}`;
  }

  private updateCardButtons(cardEl: HTMLElement, playing: boolean): void {
    cardEl.querySelectorAll<HTMLButtonElement>('[data-action="play"]').forEach((btn) => {
      btn.textContent = playing ? '⏸ Stop Video' : '▶ Watch Book';
      btn.classList.toggle('is-playing', playing);
    });
  }

  public highlightActiveChapter(cardEl: HTMLElement, ep: Episode, seconds: number): void {
    const activeCh = findChapterForSeconds(ep, seconds);
    cardEl.querySelectorAll<HTMLElement>('[data-chapter-sec]').forEach((el) => {
      const sec = Number(el.dataset.chapterSec || 0);
      const isMatch = activeCh ? sec === activeCh.seconds : sec === 0;
      el.classList.toggle('is-active', isMatch);
    });

    const badgeEl = cardEl.querySelector<HTMLElement>('.active-chapter-readout');
    if (badgeEl && activeCh) {
      badgeEl.textContent = `${activeCh.label} · ${formatTimecode(seconds)}`;
    }
  }

  private updateMiniPlayer(ep: Episode, seconds = 0, chapterLabel?: string): void {
    const miniArt = document.getElementById('mini-player-art') as HTMLImageElement | null;
    const miniKicker = document.getElementById('mini-player-kicker');
    const miniTitle = document.getElementById('mini-player-title');
    if (miniArt) {
      miniArt.src = ep.coverUrl;
      miniArt.alt = ep.bookName;
    }
    const ch = chapterLabel || findChapterForSeconds(ep, seconds)?.label || ep.bookName;
    if (miniKicker) {
      miniKicker.textContent =
        ep.bookNum === 0
          ? `INTRO · ${ch.toUpperCase()}`
          : `BOOK ${String(ep.bookNum).padStart(2, '0')} · ${ch.toUpperCase()}`;
    }
    if (miniTitle) {
      miniTitle.textContent = ep.title;
    }
  }
}
