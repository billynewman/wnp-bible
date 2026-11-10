import { Catalog, Episode, Testament } from './types';
import { escapeHtml, formatDuration, formatTimecode } from './autolink';
import { loadCatalog, loadSeriesEpisodes } from './feeds';
import { BiblePlayer, readWatchHistory } from './player';
import { BibleDeck } from './deck';
import { openOfferSheet } from './offersheet';
import { openInspectorSheet } from './inspector';

type PlaneName = 'now' | 'shows' | 'you';

class BibleApp {
  private catalog!: Catalog;
  private episodes: Episode[] = [];
  private player = new BiblePlayer();
  private deck!: BibleDeck;
  private activePlane: PlaneName = 'now';
  private bookFilter: 'ALL' | Testament = 'ALL';
  private searchQuery = '';

  public async init(): Promise<void> {
    const nowDeckEl = document.getElementById('now-deck') as HTMLElement;
    this.deck = new BibleDeck(nowDeckEl, this.player, {
      onOpenOfferSheet: (ep, activeSec) => {
        openOfferSheet(
          ep,
          {
            onSelectChapter: (targetEp, sec, label) => {
              this.switchPlane('now');
              this.deck.scrollToEpisode(targetEp.id, sec, label);
            },
            onFullscreen: (targetEp) => {
              this.switchPlane('now');
              const cardEl = document.querySelector<HTMLElement>(`.card[data-episode-id="${targetEp.id}"]`);
              if (cardEl) {
                this.player.toggleFullscreen(cardEl, targetEp);
              }
            }
          },
          activeSec
        );
      },
      onOpenInspector: (ep, tab) => {
        openInspectorSheet(
          ep,
          this.episodes,
          {
            onSelectChapter: (targetEp, sec, label) => {
              this.switchPlane('now');
              this.deck.scrollToEpisode(targetEp.id, sec, label);
            },
            onSelectBook: (targetEp) => {
              this.switchPlane('now');
              this.deck.scrollToEpisode(targetEp.id, 0, targetEp.chapters[0]?.label);
            }
          },
          tab
        );
      }
    });

    this.bindRailNavigation();
    this.bindMiniPlayer();
    this.bindKeyboardShortcuts();

    this.catalog = await loadCatalog('/feeds.json');
    this.episodes = await loadSeriesEpisodes(this.catalog);

    this.deck.render(this.episodes);
    this.renderBooksPlane();
    this.renderStudyPlane();

    window.addEventListener('wnp:history-updated', () => {
      if (this.activePlane === 'you') {
        this.renderStudyPlane();
      }
    });

    // Check URL hash or query param for direct book deep link (e.g. ?book=43 or #john)
    this.handleInitialDeepLink();
    this.registerServiceWorker();
  }

  private bindRailNavigation(): void {
    const rail = document.getElementById('rail');
    if (!rail) return;
    rail.querySelectorAll<HTMLButtonElement>('button[data-plane]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const plane = (btn.dataset.plane as PlaneName) || 'now';
        this.switchPlane(plane);
      });
    });
  }

  private switchPlane(plane: PlaneName): void {
    this.activePlane = plane;
    const nowEl = document.getElementById('now-deck');
    const showsEl = document.getElementById('shows-plane');
    const youEl = document.getElementById('you-plane');
    const miniPlayer = document.getElementById('mini-player');

    if (nowEl) nowEl.hidden = plane !== 'now';
    if (showsEl) showsEl.hidden = plane !== 'shows';
    if (youEl) youEl.hidden = plane !== 'you';

    if (miniPlayer) {
      miniPlayer.hidden = plane === 'now' || !this.player.currentEpisode;
    }

    document.querySelectorAll<HTMLButtonElement>('#rail button[data-plane]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.plane === plane);
    });

    if (plane === 'you') {
      this.renderStudyPlane();
    }
  }

  private bindMiniPlayer(): void {
    const resumeArea = document.getElementById('mini-player-resume');
    const toggleBtn = document.getElementById('mini-player-toggle');
    const openBtn = document.getElementById('mini-player-open');

    const returnToVideo = (playImmediately: boolean) => {
      const ep = this.player.currentEpisode || this.episodes[0];
      if (!ep) return;
      this.switchPlane('now');
      if (playImmediately) {
        this.deck.scrollToEpisode(ep.id, this.player.currentSeconds);
      } else {
        this.deck.scrollToEpisode(ep.id);
      }
    };

    resumeArea?.addEventListener('click', () => returnToVideo(false));
    toggleBtn?.addEventListener('click', () => returnToVideo(true));
    openBtn?.addEventListener('click', () => returnToVideo(false));
  }

  private bindKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.body.classList.contains('has-theater-fullscreen')) {
        const ep = this.player.currentEpisode;
        if (ep) {
          const cardEl = document.querySelector<HTMLElement>(`.card[data-episode-id="${ep.id}"]`);
          if (cardEl) this.player.toggleFullscreen(cardEl, ep);
        }
      }
    });
  }

  private renderBooksPlane(): void {
    const plane = document.getElementById('shows-plane');
    if (!plane) return;

    const filtered = this.episodes.filter((ep) => {
      if (this.bookFilter !== 'ALL' && ep.testament !== this.bookFilter) return false;
      if (this.searchQuery.trim()) {
        const q = this.searchQuery.trim().toLowerCase();
        return (
          ep.bookName.toLowerCase().includes(q) ||
          ep.title.toLowerCase().includes(q) ||
          String(ep.bookNum) === q
        );
      }
      return true;
    });

    const cardsHtml = filtered
      .map((ep) => {
        const numBadge = ep.bookNum === 0 ? 'INTRO' : `BOOK ${String(ep.bookNum).padStart(2, '0')}`;
        const dur = formatDuration(ep.durationSec);
        return `
          <article class="book-tile glass" data-open-book="${escapeHtml(ep.id)}">
            <div class="book-tile-thumb-wrap">
              <img class="book-tile-thumb" src="${escapeHtml(ep.coverUrl)}" alt="${escapeHtml(ep.bookName)}" loading="lazy" />
              <span class="book-tile-badge">${escapeHtml(numBadge)}</span>
            </div>
            <div class="book-tile-body">
              <h3 class="book-tile-title">${escapeHtml(ep.bookName)}</h3>
              <div class="book-tile-meta">
                <span>${ep.chapters.length} ${ep.chapters.length === 1 ? 'Chapter' : 'Chapters'}</span>
                ${dur ? `<span>· ${escapeHtml(dur)}</span>` : ''}
              </div>
              <div class="book-tile-actions">
                <button type="button" class="tile-btn is-primary" data-play-book="${escapeHtml(ep.id)}">▶ Watch</button>
                <button type="button" class="tile-btn" data-chapters-book="${escapeHtml(ep.id)}">Chapters</button>
              </div>
            </div>
          </article>
        `;
      })
      .join('');

    plane.innerHTML = `
      <div class="plane-container">
        <header class="plane-header">
          <div>
            <div class="kicker">KING JAMES BIBLE · ALEXANDER SCOURBY</div>
            <h1 class="plane-title">All 67 Books &amp; Chapter Index</h1>
          </div>
          <div class="books-toolbar">
            <div class="filter-pills" role="group" aria-label="Filter by Testament">
              <button type="button" class="filter-chip ${this.bookFilter === 'ALL' ? 'active' : ''}" data-filter="ALL">All (67)</button>
              <button type="button" class="filter-chip ${this.bookFilter === 'OT' ? 'active' : ''}" data-filter="OT">Old Testament (39)</button>
              <button type="button" class="filter-chip ${this.bookFilter === 'NT' ? 'active' : ''}" data-filter="NT">New Testament (27)</button>
              <button type="button" class="filter-chip ${this.bookFilter === 'Intro' ? 'active' : ''}" data-filter="Intro">Intro (1)</button>
            </div>
            <input
              type="search"
              id="book-search-input"
              class="book-search-input"
              placeholder="Search Genesis, Psalms, John, 43…"
              value="${escapeHtml(this.searchQuery)}"
              aria-label="Search Bible books"
            />
          </div>
        </header>

        <div class="books-grid">
          ${cardsHtml || `<p class="empty-state">No books match "${escapeHtml(this.searchQuery)}".</p>`}
        </div>
      </div>
    `;

    plane.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.bookFilter = (btn.dataset.filter as 'ALL' | Testament) || 'ALL';
        this.renderBooksPlane();
      });
    });

    const searchInput = plane.querySelector<HTMLInputElement>('#book-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.searchQuery = searchInput.value;
        this.renderBooksPlane();
        const nextInput = plane.querySelector<HTMLInputElement>('#book-search-input');
        if (nextInput) {
          nextInput.focus();
          nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
        }
      });
    }

    plane.querySelectorAll<HTMLElement>('[data-play-book]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.playBook;
        if (id) {
          this.switchPlane('now');
          this.deck.scrollToEpisode(id, 0);
        }
      });
    });

    plane.querySelectorAll<HTMLElement>('[data-chapters-book]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.chaptersBook;
        const ep = this.episodes.find((item) => item.id === id);
        if (ep) {
          openInspectorSheet(
            ep,
            this.episodes,
            {
              onSelectChapter: (targetEp, sec, label) => {
                this.switchPlane('now');
                this.deck.scrollToEpisode(targetEp.id, sec, label);
              },
              onSelectBook: (targetEp) => {
                this.switchPlane('now');
                this.deck.scrollToEpisode(targetEp.id, 0);
              }
            },
            'chapters'
          );
        }
      });
    });

    plane.querySelectorAll<HTMLElement>('[data-open-book]').forEach((tile) => {
      tile.addEventListener('click', () => {
        const id = tile.dataset.openBook;
        if (id) {
          this.switchPlane('now');
          this.deck.scrollToEpisode(id);
        }
      });
    });
  }

  private renderStudyPlane(): void {
    const plane = document.getElementById('you-plane');
    if (!plane) return;

    const history = readWatchHistory();
    const totalChaptersCount = this.episodes.reduce((acc, ep) => acc + ep.chapters.length, 0);

    const historyHtml =
      history.length > 0
        ? history
            .map((h) => `
              <button type="button" class="history-row glass" data-resume-ep="${escapeHtml(h.episodeId)}" data-resume-sec="${h.seconds}" data-resume-label="${escapeHtml(h.chapterLabel)}">
                <span class="history-badge">${h.bookNum === 0 ? '00' : String(h.bookNum).padStart(2, '0')}</span>
                <span class="history-meta">
                  <strong>${escapeHtml(h.bookName)}</strong>
                  <small>${escapeHtml(h.chapterLabel)} · ${formatTimecode(h.seconds)}</small>
                </span>
                <span class="history-cta">▶ Resume</span>
              </button>
            `)
            .join('')
        : `<p class="empty-state">Your recently watched books and chapter timestamps will appear here automatically as you study.</p>`;

    plane.innerHTML = `
      <div class="plane-container study-container">
        <header class="plane-header">
          <div class="kicker">STUDY &amp; EDITION NOTES · BIBLE.WNP.APP</div>
          <h1 class="plane-title">King James Bible · Audio &amp; Text Series</h1>
          <p class="plane-subtitle">
            Complete 67-video horizontal HD scripture deck with ${totalChaptersCount} synchronized chapter markers.
          </p>
        </header>

        <section class="study-section">
          <h2 class="study-heading">Continue Studying</h2>
          <div class="history-list">${historyHtml}</div>
        </section>

        <section class="study-section glass study-card">
          <div class="kicker">INSTALL AS MOBILE OR DESKTOP APP</div>
          <h2 class="study-heading">Add bible.wnp.app to Home Screen</h2>
          <p>
            Install this Progressive Web App for instant full-screen access to all 66 Books of the Old and New Testaments plus the series introduction:
          </p>
          <ul class="study-list">
            <li><strong>iPhone &amp; iPad (Safari):</strong> Tap <strong>Share</strong> (square with arrow) → <strong>Add to Home Screen</strong>.</li>
            <li><strong>Android &amp; Desktop Chrome:</strong> Tap the browser menu or address bar install icon → <strong>Install App</strong>.</li>
            <li><strong>Fullscreen Video:</strong> Tap <strong>⛶ Fullscreen</strong> on any card to expand the 16:9 synchronized text &amp; audio reading.</li>
          </ul>
        </section>

        <section class="study-section glass study-card">
          <div class="kicker">NON-COMMERCIAL ATTRIBUTION &amp; SOURCE</div>
          <h2 class="study-heading">Scourby YouBible Channel</h2>
          <p>
            Authorized King James Version (KJV) narration by <strong>Alexander Scourby</strong> with synchronized video text and chapter markers.
          </p>
          <p>
            <strong>Copyright &amp; Ministry Attribution:</strong> © 1991 Litchfield Associates · Kindness Works International Foundation 501(c)(3). Provided free of charge for non-commercial scripture study.
          </p>
          <div class="study-links-row">
            <a href="https://www.youtube.com/@ScourbyYouBible" target="_blank" rel="noopener noreferrer" class="chrome-btn is-primary">
              @ScourbyYouBible Channel ↗
            </a>
            <a href="https://www.youtube.com/playlist?list=PLyH3jcNYnj_vee7HfFWgGmcW2E3qdsHLi" target="_blank" rel="noopener noreferrer" class="chrome-btn">
              Full 67-Video YouTube Playlist ↗
            </a>
            <a href="/feeds/scourby-kjv.xml" target="_blank" rel="noopener noreferrer" class="chrome-btn">
              Series RSS Feed (XML) ↗
            </a>
          </div>
        </section>
      </div>
    `;

    plane.querySelectorAll<HTMLButtonElement>('[data-resume-ep]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const epId = btn.dataset.resumeEp;
        const sec = Number(btn.dataset.resumeSec || 0);
        const label = btn.dataset.resumeLabel;
        if (epId) {
          this.switchPlane('now');
          this.deck.scrollToEpisode(epId, sec, label);
        }
      });
    });
  }

  private handleInitialDeepLink(): void {
    const params = new URLSearchParams(window.location.search);
    const bookParam = params.get('book') || window.location.hash.replace(/^#/, '');
    const tParam = Number(params.get('t') || 0);
    if (!bookParam) return;

    const q = bookParam.toLowerCase().trim();
    const target = this.episodes.find(
      (ep) =>
        String(ep.bookNum) === q ||
        ep.id.toLowerCase() === q ||
        ep.bookName.toLowerCase().replace(/\s+/g, '-') === q ||
        ep.bookName.toLowerCase() === q
    );
    if (target) {
      setTimeout(() => {
        this.deck.scrollToEpisode(target.id, tParam > 0 ? tParam : undefined);
      }, 150);
    }
  }

  private registerServiceWorker(): void {
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      });
    }
  }
}

const app = new BibleApp();
app.init().catch((err) => {
  console.error('Failed to initialize WNP Bible app:', err);
});
