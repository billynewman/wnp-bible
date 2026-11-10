export function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDuration(totalSec?: number): string {
  if (!totalSec || totalSec <= 0 || !Number.isFinite(totalSec)) return '';
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  if (h > 0) {
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function formatTimecode(seconds: number): string {
  const sec = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function autolinkText(raw: string): string {
  if (!raw) return '';
  const escaped = escapeHtml(raw);
  const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
  return escaped.replace(urlRegex, (url) => {
    let cleanUrl = url;
    let trailing = '';
    while (/[.,;:!?)]$/.test(cleanUrl)) {
      trailing = cleanUrl.slice(-1) + trailing;
      cleanUrl = cleanUrl.slice(0, -1);
    }
    const label = cleanUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="note-autolink">${label} ↗</a>${trailing}`;
  });
}
