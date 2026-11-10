import type { Card, Catalog, ChapterMark, Episode, Testament } from './types.ts';

const CHAPTERS_PER_SLIDE = 9;

export function parseChaptersFromDescription(desc: string): ChapterMark[] {
  if (!desc) return [];
  const results: ChapterMark[] = [];
  const seen = new Set<number>();
  const lines = desc.split(/\r?\n/);
  const timeRegex = /(?:^|\s)(\d{1,2}:\d{2}(?::\d{2})?)\b/;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(timeRegex);
    if (!match) continue;
    const timecode = match[1];
    const parts = timecode.split(':').map(Number);
    const seconds =
      parts.length === 3
        ? parts[0] * 3600 + parts[1] * 60 + parts[2]
        : parts[0] * 60 + parts[1];
    if (seen.has(seconds)) continue;
    seen.add(seconds);
    const label = line
      .replace(match[0], ' ')
      .replace(/^[\s\-–—·•:|()[\]]+|[\s\-–—·•:|()[\]]+$/g, '')
      .trim() || `Timestamp ${timecode}`;
    results.push({ timecode, seconds, label });
  }
  return results.sort((a, b) => a.seconds - b.seconds);
}

export function buildEpisodeCards(ep: Omit<Episode, 'cards'>): Card[] {
  const cards: Card[] = [];

  // Slide 1: 16:9 Horizontal YouTube Video Stage + Quick Chapter Pill Bar
  cards.push({
    id: `${ep.id}-video`,
    type: 'video',
    headline: ep.title,
    subline: ep.testament === 'Intro'
      ? 'Series Introduction · Scourby YouBible'
      : `${ep.testament === 'OT' ? 'Old Testament' : 'New Testament'} · ${ep.totalBookChapters} ${ep.totalBookChapters === 1 ? 'Chapter' : 'Chapters'}`,
    imageUrl: ep.coverUrl,
    chapters: ep.chapters
  });

  // Slides 2..N: Swipeable Chapter Link Cards (chunked for fast horizontal swipe navigation)
  if (ep.chapters.length > 0) {
    const chunks: ChapterMark[][] = [];
    for (let i = 0; i < ep.chapters.length; i += CHAPTERS_PER_SLIDE) {
      chunks.push(ep.chapters.slice(i, i + CHAPTERS_PER_SLIDE));
    }
    chunks.forEach((chunk, idx) => {
      const firstLabel = chunk[0]?.label || 'Start';
      const lastLabel = chunk[chunk.length - 1]?.label || '';
      const rangeSubtitle = chunk.length > 1 ? `${firstLabel} — ${lastLabel}` : firstLabel;
      cards.push({
        id: `${ep.id}-chapters-${idx + 1}`,
        type: 'chapters',
        headline: chunks.length > 1
          ? `${ep.bookName} · Chapters (${idx + 1}/${chunks.length})`
          : `${ep.bookName} · Chapter Timestamps`,
        subline: rangeSubtitle,
        chapters: chunk,
        slideIndex: idx + 1,
        totalChapterSlides: chunks.length
      });
    });
  }

  // Final Slide: Book Synopsis, Study Notes & Non-Commercial Attribution
  cards.push({
    id: `${ep.id}-notes`,
    type: 'notes',
    headline: `${ep.bookName} · Study Notes & Source`,
    subline: 'Scourby YouBible Channel · © 1991 Litchfield Associates',
    body: `${ep.synopsis}\n\nWatch on YouTube: https://www.youtube.com/watch?v=${ep.youtubeId}\nPlaylist: https://www.youtube.com/playlist?list=PLyH3jcNYnj_vee7HfFWgGmcW2E3qdsHLi\n\nNon-commercial scripture study edition. Narration by Alexander Scourby (© 1991 Litchfield Associates · Kindness Works International Foundation 501(c)(3)).`,
    chapters: ep.chapters
  });

  return cards;
}

export async function loadCatalog(url = '/feeds.json'): Promise<Catalog> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load catalog: ${res.status}`);
  return (await res.json()) as Catalog;
}

export function normalizeJsonEpisodes(rawItems: Array<Record<string, unknown>>): Episode[] {
  return rawItems.map((raw, i) => {
    const bookNum = typeof raw.bookNum === 'number' ? raw.bookNum : i;
    const bookName = String(raw.bookName || raw.book || `Book ${bookNum}`);
    const youtubeId = String(raw.youtubeId || '');
    const chapters = Array.isArray(raw.chapters)
      ? (raw.chapters as ChapterMark[]).map((c) => ({
          timecode: String(c.timecode || '0:00'),
          seconds: Number(c.seconds || 0),
          label: String(c.label || '')
        }))
      : [];
    const testament = (raw.testament as Testament) || (bookNum === 0 ? 'Intro' : bookNum <= 39 ? 'OT' : 'NT');
    const base: Omit<Episode, 'cards'> = {
      id: String(raw.id || `scourby-kjv-${String(bookNum).padStart(2, '0')}`),
      showId: String(raw.showId || 'scourby-kjv'),
      bookNum,
      bookName,
      title: String(raw.title || (bookNum === 0 ? `00 · ${bookName}` : `Book ${String(bookNum).padStart(2, '0')} · ${bookName}`)),
      ytTitle: String(raw.ytTitle || bookName),
      testament,
      totalBookChapters: Number(raw.totalBookChapters || chapters.length || 1),
      youtubeId,
      durationSec: Number(raw.durationSec || 0),
      coverUrl: String(raw.coverUrl || `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`),
      coverMaxUrl: String(raw.coverMaxUrl || `https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`),
      synopsis: String(raw.synopsis || ''),
      chapters
    };
    return {
      ...base,
      cards: buildEpisodeCards(base)
    };
  }).sort((a, b) => a.bookNum - b.bookNum);
}

export function parseRssXmlFeed(xmlText: string, showId = 'scourby-kjv'): Episode[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const items = Array.from(doc.querySelectorAll('item'));

  return items.map((item, idx) => {
    const title = item.querySelector('title')?.textContent?.trim() || `Book ${idx}`;
    const link = item.querySelector('link')?.textContent?.trim() || '';
    const ytNode = item.getElementsByTagName('yt:videoId')[0];
    const ytMatch = link.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    const youtubeId = ytNode?.textContent?.trim() || (ytMatch ? ytMatch[1] : '');
    const epNumNode = item.getElementsByTagName('itunes:episode')[0];
    const bookNum = epNumNode ? Number(epNumNode.textContent) : idx;
    const durNode = item.getElementsByTagName('itunes:duration')[0];
    const durationSec = durNode ? Number(durNode.textContent) || 0 : 0;
    const desc = item.querySelector('description')?.textContent?.trim() || '';
    const chapters = parseChaptersFromDescription(desc);
    const firstParagraph = desc.split(/\n\n/)[0]?.trim() || title;
    const bookName = title.replace(/^Book\s+\d+\s*·\s*/i, '').replace(/^00\s*·\s*/i, '').trim();
    const testament: Testament = bookNum === 0 ? 'Intro' : bookNum <= 39 ? 'OT' : 'NT';

    const base: Omit<Episode, 'cards'> = {
      id: item.querySelector('guid')?.textContent?.trim() || `scourby-kjv-${String(bookNum).padStart(2, '0')}`,
      showId,
      bookNum,
      bookName,
      title,
      ytTitle: title,
      testament,
      totalBookChapters: chapters.length || 1,
      youtubeId,
      durationSec,
      coverUrl: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
      coverMaxUrl: `https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`,
      synopsis: firstParagraph,
      chapters
    };
    return {
      ...base,
      cards: buildEpisodeCards(base)
    };
  }).sort((a, b) => a.bookNum - b.bookNum);
}

export async function loadSeriesEpisodes(catalog: Catalog): Promise<Episode[]> {
  const show = catalog.shows[0];
  if (!show) return [];

  try {
    const res = await fetch(show.feedUrl);
    if (res.ok) {
      const data = await res.json();
      const rawList = Array.isArray(data) ? data : data.episodes || [];
      return normalizeJsonEpisodes(rawList);
    }
  } catch {
    // Fallback to XML RSS feed if JSON fails
  }

  if (show.rssUrl) {
    const rssRes = await fetch(show.rssUrl);
    if (rssRes.ok) {
      const xml = await rssRes.text();
      return parseRssXmlFeed(xml, show.id);
    }
  }

  return [];
}
