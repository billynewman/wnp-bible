import { Episode } from './types';
import { autolinkText, escapeHtml, formatDuration } from './autolink';

export interface OfferSheetCallbacks {
  onSelectChapter: (ep: Episode, seconds: number, label: string) => void;
  onFullscreen: (ep: Episode) => void;
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

export function openOfferSheet(
  ep: Episode,
  callbacks: OfferSheetCallbacks,
  activeSeconds = 0
): void {
  const dialog = document.getElementById('offer-sheet') as HTMLDialogElement | null;
  const body = document.getElementById('offer-body');
  if (!dialog || !body) return;
  attachDialogLightDismiss(dialog);

  const durText = formatDuration(ep.durationSec);
  const testamentBadge =
    ep.testament === 'Intro'
      ? 'Series Introduction'
      : ep.testament === 'OT'
      ? 'Old Testament'
      : 'New Testament';

  const chaptersHtml = ep.chapters
    .map((ch) => {
      const isCurrent = ch.seconds === activeSeconds;
      const ytDeepLink = `https://www.youtube.com/watch?v=${encodeURIComponent(ep.youtubeId)}&t=${ch.seconds}s`;
      return `
        <div class="sheet-chapter-row ${isCurrent ? 'is-active' : ''}">
          <button type="button" class="sheet-chapter-play" data-jump-sec="${ch.seconds}" data-jump-label="${escapeHtml(ch.label)}">
            <span class="sheet-ch-time">${escapeHtml(ch.timecode)}</span>
            <span class="sheet-ch-label">${escapeHtml(ch.label)}</span>
            <span class="sheet-ch-cta">▶ Play</span>
          </button>
          <a href="${ytDeepLink}" target="_blank" rel="noopener noreferrer" class="sheet-ch-ext" title="Open chapter on YouTube">↗</a>
        </div>
      `;
    })
    .join('');

  body.innerHTML = `
    <header class="sheet-header">
      <div>
        <div class="sheet-kicker">${escapeHtml(testamentBadge)} ${durText ? `· ${escapeHtml(durText)}` : ''}</div>
        <h2 class="sheet-title">${escapeHtml(ep.title)}</h2>
      </div>
      <button type="button" class="sheet-close-btn" data-close-sheet aria-label="Close">✕</button>
    </header>

    <div class="sheet-QuickActions">
      <button type="button" class="btn-primary sheet-action-btn" data-sheet-fullscreen>
        ⛶ Watch Fullscreen Video
      </button>
      <a href="https://www.youtube.com/watch?v=${encodeURIComponent(ep.youtubeId)}" target="_blank" rel="noopener noreferrer" class="btn-ghost sheet-action-btn">
        YouTube Watch Page ↗
      </a>
    </div>

    <p class="sheet-synopsis">${autolinkText(ep.synopsis)}</p>

    <div class="sheet-section-header">
      <span>CHAPTER TIMESTAMPS (${ep.chapters.length})</span>
      <span>TAP TO SEEK VIDEO</span>
    </div>
    <div class="sheet-chapters-list">
      ${chaptersHtml}
    </div>

    <footer class="sheet-attribution">
      <div><strong>Scourby YouBible Channel</strong> · King James Version (Audio &amp; Text Synced)</div>
      <div>Narration © 1991 Litchfield Associates · Kindness Works International Foundation 501(c)(3) · Non-Commercial Study Edition</div>
    </footer>
  `;

  body.querySelector('[data-close-sheet]')?.addEventListener('click', () => dialog.close());
  body.querySelector('[data-sheet-fullscreen]')?.addEventListener('click', () => {
    dialog.close();
    callbacks.onFullscreen(ep);
  });

  body.querySelectorAll<HTMLButtonElement>('[data-jump-sec]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sec = Number(btn.dataset.jumpSec || 0);
      const label = btn.dataset.jumpLabel || ep.bookName;
      dialog.close();
      callbacks.onSelectChapter(ep, sec, label);
    });
  });

  if (!dialog.open) {
    dialog.showModal();
  }
}
