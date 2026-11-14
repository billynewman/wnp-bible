export type Testament = 'Intro' | 'OT' | 'NT' | 'Apocrypha';

export interface ShowConfig {
  id: string;
  title: string;
  subtitle: string;
  type: 'video';
  feedUrl: string;
  rssUrl: string;
  channelUrl: string;
  playlistUrl: string;
  cover: string;
  accent: string;
}

export interface Catalog {
  app: {
    name: string;
    shortName: string;
    domain: string;
    playlistUrl: string;
    channelUrl: string;
  };
  shows: ShowConfig[];
}

export interface ChapterMark {
  timecode: string;
  seconds: number;
  label: string;
}

export type SlideType = 'video' | 'chapters' | 'notes';

export interface Card {
  id: string;
  type: SlideType;
  headline?: string;
  body?: string;
  subline?: string;
  imageUrl?: string;
  chapters?: ChapterMark[];
  slideIndex?: number;
  totalChapterSlides?: number;
}

export interface Episode {
  id: string;
  showId: string;
  bookNum: number;
  bookName: string;
  title: string;
  ytTitle: string;
  testament: Testament;
  totalBookChapters: number;
  youtubeId: string;
  durationSec: number;
  coverUrl: string;
  coverMaxUrl?: string;
  synopsis: string;
  chapters: ChapterMark[];
  cards: Card[];
}

export interface ThemePalette {
  bg: string;
  fg: string;
  accent: string;
  glass: string;
}

export interface WatchProgress {
  episodeId: string;
  bookNum: number;
  bookName: string;
  youtubeId: string;
  seconds: number;
  chapterLabel: string;
  updatedAt: number;
}
