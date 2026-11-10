import { Episode } from './types';
import { escapeHtml, formatDuration } from './autolink';

export interface InspectorCallbacks {
  onSelectChapter: (ep: Episode, seconds: number, label: string) => void;
  onSelectBook: (ep: Episode) => void;
}

function attachDialogLightDismiss(dialog: HTMLDialogElement): void {
  if (dialog.dataset.lightDismissBound === '1') return;
  dialog.dataset.lightDismissBound = '1';
  dialog.addEventListener('click', (event) => {
    const rect = dialog.getBoundingClientRect();
    const isInDialog =
      rect.top <= event.clientY &&
      event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX &&
      event.clientX <= rect.left + rect.width;
    if (!isInDialog) {
      dialog.close();
    }
  });
}

export function openInspectorSheet(
  activeEp: Episode,
  allEpisodes: Episode[],
  callbacks: InspectorCallbacks,
  initialTab: 'chapters' | 'books' = 'chapters'
): void {
  const dialog = document.getElementById('inspector-sheet') as HTMLDialogElement | null;
  const body = document.getElementById('inspector-body');
  if (!dialog || !body) return;
  attachDialogLightDismiss(dialog);

  let currentTab: 'chapters' | 'books' = initialTab;
  let filterTestament: 'ALL' | 'OT' | 'NT' = 'ALL';

  const render = () => {
    const chaptersHtml = activeEp.chapters
      .map(
        (ch) => `
        <button type="button" class="inspector-item" data-ch-sec="${ch.seconds}" data-ch-label="${escapeHtml(ch.label)}">
          <span class="inspector-time">${escapeHtml(ch.timecode)}</span>
          <span class="inspector-label">${escapeHtml(ch.label)}</span>
          <span class="inspector-go">▶ Play</span>
        </button>
      `
      )
      .join('');

    const filteredBooks = allEpisodes.filter((ep) => {
      if (filterTestament === 'ALL') return true;
      return ep.testament === filterTestament;
    });

    const booksHtml = filteredBooks
      .map((ep) => {
        const isCurrent = ep.id === activeEp.id;
        const badge =
          ep.bookNum === 0 ? '00' : String(ep.bookNum).padStart(2, '0');
        const dur = formatDuration(ep.durationSec);
        return `
          <button type="button" class="inspector-item ${isCurrent ? 'is-active' : ''}" data-book-id="${escapeHtml(ep.id)}">
            <span class="inspector-book-num">${badge}</span>
            <span class="inspector-label">
              <strong>${escapeHtml(ep.bookName)}</strong>
              <small>${ep.chapters.length} ${ep.chapters.length === 1 ? 'chapter' : 'chapters'}${dur ? ` · ${escapeHtml(dur)}` : ''}</small>
            </span>
            <span class="inspector-go">${isCurrent ? 'Active' : 'Open →'}</span>
          </button>
        `;
      })
      .join('');

    body.innerHTML = `
      <header class="sheet-header">
        <div>
          <div class="sheet-kicker">SCRIPTURE NAVIGATOR · 67 VIDEOS</div>
          <h2 class="sheet-title">${escapeHtml(activeEp.title)}</h2>
        </div>
        <button type="button" class="sheet-close-btn" data-close-inspector aria-label="Close">✕</button>
      </header>

      <div class="inspector-tabs" role="tablist">
        <button type="button" role="tab" class="inspector-tab ${currentTab === 'chapters' ? 'active' : ''}" data-tab="chapters">
          ${escapeHtml(activeEp.bookName)} Chapters (${activeEp.chapters.length})
        </button>
        <button type="button" role="tab" class="inspector-tab ${currentTab === 'books' ? 'active' : ''}" data-tab="books">
          All 67 Books
        </button>
      </div>

      ${
        currentTab === 'books'
          ? `<div class="inspector-filter-row">
              <button type="button" class="filter-chip ${filterTestament === 'ALL' ? 'active' : ''}" data-testament="ALL">All (67)</button>
              <button type="button" class="filter-chip ${filterTestament === 'OT' ? 'active' : ''}" data-testament="OT">Old Testament (39)</button>
              <button type="button" class="filter-chip ${filterTestament === 'NT' ? 'active' : ''}" data-testament="NT">New Testament (27)</button>
            </div>`
          : ''
      }

      <div class="inspector-list">
        ${currentTab === 'chapters' ? chaptersHtml : booksHtml}
      </div>
    `;

    body.querySelector('[data-close-inspector]')?.addEventListener('click', () => dialog.close());
    body.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        currentTab = (tabBtn.dataset.tab as 'chapters' | 'books') || 'chapters';
        render();
      });
    });

    body.querySelectorAll<HTMLButtonElement>('[data-testament]').forEach((fBtn) => {
      fBtn.addEventListener('click', () => {
        filterTestament = (fBtn.dataset.testament as 'ALL' | 'OT' | 'NT') || 'ALL';
        render();
      });
    });

    body.querySelectorAll<HTMLButtonElement>('[data-ch-sec]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sec = Number(btn.dataset.chSec || 0);
        const label = btn.dataset.chLabel || activeEp.bookName;
        dialog.close();
        callbacks.onSelectChapter(activeEp, sec, label);
      });
    });

    body.querySelectorAll<HTMLButtonElement>('[data-book-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.bookId;
        const found = allEpisodes.find((e) => e.id === id);
        if (found) {
          dialog.close();
          callbacks.onSelectBook(found);
        }
      });
    });
  };

  render();
  if (!dialog.open) {
    dialog.showModal();
  }
}
