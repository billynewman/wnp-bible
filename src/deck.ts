import { Card, Episode } from './types';
import { autolinkText, escapeHtml, formatDuration } from './autolink';
import { BiblePlayer, readWatchHistory } from './player';
import { applyThemeFromCover } from './theme';

export interface DeckCallbacks {
  onOpenOfferSheet: (ep: Episode, activeSec: number) => void;
  onOpenInspector: (ep: Episode, tab: 'chapters' | 'books') => void;
}

export class BibleDeck {
  private deckEl: HTMLElement;
  private episodes: Episode[] = [];
  private player: BiblePlayer;
  private callbacks: DeckCallbacks;
  private cardMap = new Map<string, HTMLElement>();
  private activeEpisodeId = '';
  private activeSlideIndex = 0;
  private resizeLockUntil = 0;
  private isRestoringPosition = false;
  private restoreTimers: number[] = [];
  private orientationListenersBound = false;

  constructor(
    deckEl: HTMLElement,
    player: BiblePlayer,
    callbacks: DeckCallbacks
  ) {
    this.deckEl = deckEl;
    this.player = player;
    this.callbacks = callbacks;
  }

  public render(episodes: Episode[]): void {
    this.episodes = episodes;
    this.cardMap.clear();
    this.deckEl.innerHTML = '';

    const frag = document.createDocumentFragment();
    episodes.forEach((ep, index) => {
      const cardEl = this.createCardElement(ep, index);
      this.cardMap.set(ep.id, cardEl);
      frag.appendChild(cardEl);
    });
    this.deckEl.appendChild(frag);

    this.setupScrollSnapSync();

    // Activate initial card
    if (episodes.length > 0) {
      const firstCard = this.cardMap.get(episodes[0].id);
      if (firstCard) {
        this.activateCard(firstCard, episodes[0]);
      }
    }
  }

  public scrollToEpisode(episodeId: string, autoplaySec?: number, chapterLabel?: string): void {
    const cardEl = this.cardMap.get(episodeId);
    const ep = this.episodes.find((e) => e.id === episodeId);
    if (!cardEl || !ep) return;

    cardEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.activateCard(cardEl, ep);

    if (typeof autoplaySec === 'number') {
      this.player.playYoutube(cardEl, ep, autoplaySec, chapterLabel);
    }
  }

  private createCardElement(ep: Episode, index: number): HTMLElement {
    const article = document.createElement('article');
    article.className = 'card';
    article.dataset.episodeId = ep.id;
    article.dataset.bookNum = String(ep.bookNum);

    const slidesHtml = ep.cards
      .map((slide, sIdx) => this.renderSlideHtml(ep, slide, sIdx, index === 0))
      .join('');

    const dotsHtml = ep.cards
      .map(
        (slide, sIdx) =>
          `<button type="button" class="slide-dot ${sIdx === 0 ? 'active' : ''}" data-slide-idx="${sIdx}" aria-label="Slide ${sIdx + 1}: ${escapeHtml(slide.type)}"></button>`
      )
      .join('');

    const badgeText =
      ep.bookNum === 0
        ? 'SERIES INTRO · 00 / 66'
        : `${ep.testament === 'OT' ? 'OLD TESTAMENT' : 'NEW TESTAMENT'} · BOOK ${String(ep.bookNum).padStart(2, '0')} OF 66`;

    const durText = formatDuration(ep.durationSec);
    const firstChapter = ep.chapters[0]?.label || ep.bookName;

    article.innerHTML = `
      <div class="slides">${slidesHtml}</div>
      <div class="card-chrome glass">
        <div class="chrome-top-row">
          <div class="kicker">${escapeHtml(badgeText)}${durText ? ` · ${escapeHtml(durText)}` : ''}</div>
          <div class="slide-dots" role="tablist" aria-label="Card Slides">${dotsHtml}</div>
        </div>
        <h2 class="title">${escapeHtml(ep.title)}</h2>
        <div class="chrome-subrow">
          <span class="active-chapter-readout">${escapeHtml(firstChapter)} · ${ep.chapters.length} ${ep.chapters.length === 1 ? 'Chapter' : 'Chapters'}</span>
          <span class="swipe-hint">Swipe ⇆ for Chapter Links &amp; Notes</span>
        </div>
        <div class="chrome-actions">
          <button type="button" class="chrome-btn is-primary" data-action="play">▶ Watch Book</button>
          <button type="button" class="chrome-btn is-fullscreen" data-action="fullscreen" title="Push video to Fullscreen">⛶ Fullscreen</button>
          <button type="button" class="chrome-btn" data-action="chapters">📖 Chapters (${ep.chapters.length})</button>
          <button type="button" class="chrome-btn" data-action="notes">Notes</button>
        </div>
      </div>
      ${this.renderDesktopSidebarHtml(ep, badgeText, durText)}
    `;

    this.bindCardEvents(article, ep);
    return article;
  }

  private renderSlideHtml(ep: Episode, slide: Card, sIdx: number, isFirstCard: boolean): string {
    if (slide.type === 'video') {
      const quickPills = ep.chapters
        .slice(0, 24)
        .map(
          (ch, idx) => `
          <button type="button" class="quick-ch-pill ${idx === 0 ? 'is-active' : ''}" data-chapter-sec="${ch.seconds}" data-chapter-label="${escapeHtml(ch.label)}">
            <span class="pill-time">${escapeHtml(ch.timecode)}</span>
            <span class="pill-label">${escapeHtml(ch.label.replace(new RegExp(`^${ep.bookName}\\s+`, 'i'), 'Ch. '))}</span>
          </button>
        `
        )
        .join('');

      const moreCount = ep.chapters.length > 24 ? ep.chapters.length - 24 : 0;

      return `
        <div class="slide slide-video" data-slide-type="video" data-slide-index="${sIdx}">
          <div class="video-stage-container">
            <div class="youtube-stage-wrap">
              <button type="button" class="yt-poster-trigger" data-action="play" aria-label="Play ${escapeHtml(ep.title)}">
                <img
                  class="yt-poster-img"
                  src="${escapeHtml(ep.coverMaxUrl || ep.coverUrl)}"
                   data-fallback="${escapeHtml(ep.coverUrl)}"
                  alt="${escapeHtml(ep.title)}"
                  loading="${isFirstCard ? 'eager' : 'lazy'}"
                />
                <div class="yt-poster-overlay">
                  <span class="yt-play-circle">▶</span>
                  <span class="yt-play-caption">Watch 16:9 Audio &amp; Text Video</span>
                </div>
              </button>
              <button type="button" class="stage-fullscreen-fab" data-action="fullscreen" aria-label="Toggle Fullscreen Video" title="Fullscreen Video">
                ⛶ Fullscreen
              </button>
            </div>

            <div class="quick-chapter-strip" aria-label="Quick Chapter Jump Strip">
              ${quickPills}
              ${
                moreCount > 0
                  ? `<button type="button" class="quick-ch-pill is-more" data-action="chapters">+${moreCount} more chapters…</button>`
                  : ''
              }
            </div>
          </div>
        </div>
      `;
    }

    if (slide.type === 'chapters') {
      const chCards = (slide.chapters || [])
        .map((ch) => {
          const ytUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(ep.youtubeId)}&t=${ch.seconds}s`;
          return `
            <div class="chapter-link-card" data-chapter-sec="${ch.seconds}">
              <button type="button" class="chapter-link-main" data-jump-sec="${ch.seconds}" data-jump-label="${escapeHtml(ch.label)}">
                <span class="ch-card-time">${escapeHtml(ch.timecode)}</span>
                <span class="ch-card-title">${escapeHtml(ch.label)}</span>
                <span class="ch-card-play">▶ Jump</span>
              </button>
              <a href="${ytUrl}" target="_blank" rel="noopener noreferrer" class="chapter-link-ext" title="Open timestamp on YouTube" aria-label="Open ${escapeHtml(ch.label)} on YouTube">↗</a>
            </div>
          `;
        })
        .join('');

      return `
        <div class="slide slide-chapters" data-slide-type="chapters" data-slide-index="${sIdx}">
          <div class="chapter-slide-card glass">
            <div class="chapter-slide-header">
              <div>
                <div class="kicker">SWIPE CHAPTER LINKS · ${escapeHtml(slide.subline || '')}</div>
                <h3 class="chapter-slide-title">${escapeHtml(slide.headline || ep.bookName)}</h3>
              </div>
              <button type="button" class="btn-ghost btn-sm" data-action="chapters">All ${ep.chapters.length} ↗</button>
            </div>
            <div class="chapter-links-grid">
              ${chCards}
            </div>
          </div>
        </div>
      `;
    }

    // slide.type === 'notes'
    const paragraphs = String(slide.body || '')
      .split(/\n\n+/)
      .map((p) => `<p>${autolinkText(p.trim())}</p>`)
      .join('');

    return `
      <div class="slide slide-notes" data-slide-type="notes" data-slide-index="${sIdx}">
        <div class="notes-slide-card glass">
          <div class="kicker">${escapeHtml(slide.subline || 'SCOURBY YOUBIBLE SERIES')}</div>
          <h3 class="notes-slide-title">${escapeHtml(slide.headline || ep.title)}</h3>
          <div class="notes-slide-body">${paragraphs}</div>
          <div class="notes-slide-actions">
            <button type="button" class="chrome-btn is-primary" data-action="play">▶ Play Book Video</button>
            <button type="button" class="chrome-btn is-fullscreen" data-action="fullscreen">⛶ Fullscreen Video</button>
            <button type="button" class="chrome-btn" data-action="chapters">📖 All ${ep.chapters.length} Chapters</button>
          </div>
        </div>
      </div>
    `;
  }

  private renderDesktopSidebarHtml(ep: Episode, badgeText: string, durText: string): string {
    const chItems = ep.chapters
      .map(
        (ch, idx) => `
        <button type="button" class="sidebar-ch-btn ${idx === 0 ? 'is-active' : ''}" data-chapter-sec="${ch.seconds}" data-jump-sec="${ch.seconds}" data-jump-label="${escapeHtml(ch.label)}">
          <span class="sidebar-ch-time">${escapeHtml(ch.timecode)}</span>
          <span class="sidebar-ch-label">${escapeHtml(ch.label)}</span>
        </button>
      `
      )
      .join('');

    return `
      <aside class="desktop-sidebar glass" aria-label="${escapeHtml(ep.bookName)} Details &amp; Chapters">
        <div class="sidebar-header">
          <div class="kicker">${escapeHtml(badgeText)}${durText ? ` · ${escapeHtml(durText)}` : ''}</div>
          <h3 class="sidebar-title">${escapeHtml(ep.title)}</h3>
          <p class="sidebar-synopsis">${escapeHtml(ep.synopsis)}</p>
          <div class="sidebar-cta-row">
            <button type="button" class="chrome-btn is-primary" data-action="play">▶ Watch Book</button>
            <button type="button" class="chrome-btn is-fullscreen" data-action="fullscreen">⛶ Fullscreen</button>
            <button type="button" class="chrome-btn" data-action="books">All 67 Books</button>
          </div>
        </div>
        <div class="sidebar-ch-header">
          <span>CHAPTER INDEX (${ep.chapters.length})</span>
          <span>CLICK TO SEEK</span>
        </div>
        <div class="sidebar-ch-list">
          ${chItems}
        </div>
      </aside>
    `;
  }

  private bindCardEvents(cardEl: HTMLElement, ep: Episode): void {
    // Fallback for maxresdefault.jpg -> hqdefault.jpg if a thumbnail 404s
    const posterImg = cardEl.querySelector<HTMLImageElement>('.yt-poster-img');
    if (posterImg) {
      posterImg.addEventListener('error', () => {
        const fb = posterImg.dataset.fallback;
        if (fb && posterImg.src !== fb) {
          posterImg.src = fb;
        }
      });
    }

    // Play / Stop toggle
    cardEl.querySelectorAll<HTMLElement>('[data-action="play"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const stageWrap = cardEl.querySelector('.youtube-stage-wrap');
        if (stageWrap?.classList.contains('is-playing') && !btn.classList.contains('yt-poster-trigger')) {
          this.player.stopCardVideo(cardEl);
        } else {
          const saved = readWatchHistory().find((h) => h.episodeId === ep.id);
          this.player.playYoutube(cardEl, ep, saved?.seconds || 0, saved?.chapterLabel);
        }
      });
    });

    // Fullscreen Video button (mobile + desktop + floating stage button)
    cardEl.querySelectorAll<HTMLElement>('[data-action="fullscreen"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.player.toggleFullscreen(cardEl, ep);
      });
    });

    // Chapters Inspector button
    cardEl.querySelectorAll<HTMLElement>('[data-action="chapters"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onOpenInspector(ep, 'chapters');
      });
    });

    // All 67 Books Inspector button
    cardEl.querySelectorAll<HTMLElement>('[data-action="books"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onOpenInspector(ep, 'books');
      });
    });

    // Notes / Offer Sheet button
    cardEl.querySelectorAll<HTMLElement>('[data-action="notes"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onOpenOfferSheet(ep, this.player.currentSeconds);
      });
    });

    // Quick Chapter Pills & Chapter Link Cards
    cardEl.querySelectorAll<HTMLElement>('[data-chapter-sec], [data-jump-sec]').forEach((el) => {
      if (el.tagName === 'BUTTON') {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const sec = Number(el.dataset.jumpSec ?? el.dataset.chapterSec ?? 0);
          const label = el.dataset.jumpLabel ?? el.dataset.chapterLabel ?? ep.bookName;
          this.player.playYoutube(cardEl, ep, sec, label);
        });
      }
    });

    // Slide pagination dots click
    const slidesEl = cardEl.querySelector<HTMLElement>('.slides');
    cardEl.querySelectorAll<HTMLButtonElement>('.slide-dot').forEach((dot) => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(dot.dataset.slideIdx || 0);
        if (slidesEl) {
          slidesEl.scrollTo({ left: idx * slidesEl.clientWidth, behavior: 'smooth' });
        }
      });
    });

    // Sync slide dots on horizontal swipe
    if (slidesEl) {
      slidesEl.addEventListener(
        'scroll',
        () => {
          if (this.isLayoutLocked()) return;
          const w = slidesEl.clientWidth || 1;
          const activeIdx = Math.round(slidesEl.scrollLeft / w);
          if (ep.id === this.activeEpisodeId) {
            this.activeSlideIndex = activeIdx;
          }
          cardEl.querySelectorAll<HTMLElement>('.slide-dot').forEach((d, idx) => {
            d.classList.toggle('active', idx === activeIdx);
          });
        },
        { passive: true }
      );
    }
  }

  private isLayoutLocked(): boolean {
    return this.isRestoringPosition || Date.now() < this.resizeLockUntil || this.player.isFullscreenActive();
  }

  private lockAndRestoreActivePosition(durationMs = 450): void {
    this.resizeLockUntil = Math.max(this.resizeLockUntil, Date.now() + durationMs);
    this.restoreTimers.forEach((id) => window.clearTimeout(id));
    this.restoreTimers = [];

    const snapToCurrent = () => {
      const cardEl = this.cardMap.get(this.activeEpisodeId);
      if (!cardEl) return;
      this.isRestoringPosition = true;
      const prevSnap = this.deckEl.style.scrollSnapType;
      this.deckEl.style.scrollSnapType = 'none';
      this.deckEl.scrollTo({ top: cardEl.offsetTop, behavior: 'instant' as ScrollBehavior });

      const slidesEl = cardEl.querySelector<HTMLElement>('.slides');
      if (slidesEl && slidesEl.clientWidth > 0) {
        const prevSlideSnap = slidesEl.style.scrollSnapType;
        slidesEl.style.scrollSnapType = 'none';
        slidesEl.scrollTo({
          left: this.activeSlideIndex * slidesEl.clientWidth,
          behavior: 'instant' as ScrollBehavior
        });
        slidesEl.style.scrollSnapType = prevSlideSnap;
      }

      requestAnimationFrame(() => {
        this.deckEl.scrollTo({ top: cardEl.offsetTop, behavior: 'instant' as ScrollBehavior });
        this.deckEl.style.scrollSnapType = prevSnap;
        this.isRestoringPosition = false;
      });
    };

    snapToCurrent();
    this.restoreTimers.push(window.setTimeout(snapToCurrent, 120));
    this.restoreTimers.push(window.setTimeout(snapToCurrent, 320));
  }

  private setupScrollSnapSync(): void {
    // 1. Lock & restore active card + slide across phone rotation, resize, and fullscreen transitions
    if (!this.orientationListenersBound) {
      this.orientationListenersBound = true;
      const onViewportShift = () => this.lockAndRestoreActivePosition(480);
      window.addEventListener('resize', onViewportShift, { passive: true });
      window.addEventListener('orientationchange', onViewportShift, { passive: true });
      window.screen?.orientation?.addEventListener('change', onViewportShift);
      window.addEventListener('wnp:fullscreen-exit', () => this.lockAndRestoreActivePosition(400));
    }

    // 2. Modern scrollsnapchange event where supported
    if ('onscrollsnapchange' in this.deckEl) {
      this.deckEl.addEventListener('scrollsnapchange', (ev: Event) => {
        if (this.isLayoutLocked()) return;
        const snapEv = ev as Event & { snapTargetBlock?: HTMLElement | null };
        const target = snapEv.snapTargetBlock;
        if (target && target.dataset.episodeId && target.dataset.episodeId !== this.activeEpisodeId) {
          const ep = this.episodes.find((e) => e.id === target.dataset.episodeId);
          if (ep) this.activateCard(target, ep);
        }
      });
    }

    // 3. IntersectionObserver fallback for Safari/Firefox & initial snap
    const observer = new IntersectionObserver(
      (entries) => {
        if (this.isLayoutLocked()) return;
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const cardEl = entry.target as HTMLElement;
            const epId = cardEl.dataset.episodeId;
            if (epId && epId !== this.activeEpisodeId) {
              const ep = this.episodes.find((e) => e.id === epId);
              if (ep) this.activateCard(cardEl, ep);
            }
          }
        }
      },
      { root: this.deckEl, threshold: 0.6 }
    );

    this.cardMap.forEach((cardEl) => observer.observe(cardEl));
  }

  private activateCard(cardEl: HTMLElement, ep: Episode): void {
    if (this.activeEpisodeId !== ep.id) {
      this.activeSlideIndex = 0;
    }
    this.activeEpisodeId = ep.id;
    this.cardMap.forEach((el, id) => {
      el.classList.toggle('is-active-card', id === ep.id);
    });
    this.player.syncCardFocus(cardEl, ep);
    applyThemeFromCover(ep.coverUrl, ep.bookNum);
  }
}
