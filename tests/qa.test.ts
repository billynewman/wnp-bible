import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { autolinkText, formatDuration, formatTimecode } from '../src/autolink.ts';
import { buildEpisodeCards, normalizeJsonEpisodes, parseChaptersFromDescription } from '../src/feeds.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const feedsJsonPath = path.resolve(__dirname, '../public/feeds.json');
const scourbyJsonPath = path.resolve(__dirname, '../public/feeds/scourby-kjv.json');
const scourbyXmlPath = path.resolve(__dirname, '../public/feeds/scourby-kjv.xml');

describe('WNP Bible (bible.wnp.app) 67-Video Series QA Suite', () => {
  it('verifies public/feeds.json is configured for bible.wnp.app and non-commercial single series', () => {
    const catalog = JSON.parse(fs.readFileSync(feedsJsonPath, 'utf8'));
    assert.equal(catalog.app.domain, 'bible.wnp.app');
    assert.equal(catalog.shows.length, 1);
    assert.equal(catalog.shows[0].id, 'scourby-kjv');
    assert.equal(catalog.shows[0].type, 'video');
  });

  it('verifies all 67 Scourby KJV videos and 941 chapter markers are present in scourby-kjv.json', () => {
    const raw = JSON.parse(fs.readFileSync(scourbyJsonPath, 'utf8'));
    assert.equal(raw.count, 67);
    assert.equal(raw.episodes.length, 67);

    const episodes = normalizeJsonEpisodes(raw.episodes);
    assert.equal(episodes.length, 67);

    // Check Intro (00), Genesis (01), Psalms (19), John (43), Revelation (66)
    assert.equal(episodes[0].bookNum, 0);
    assert.equal(episodes[0].youtubeId, 'VZYFExq0rFQ');
    assert.equal(episodes[1].bookNum, 1);
    assert.equal(episodes[1].bookName, 'Genesis');
    assert.equal(episodes[1].youtubeId, 'OgFT_IxwJJY');
    assert.equal(episodes[1].totalBookChapters, 50);
    assert.equal(episodes[1].chapters.length, 10);

    const psalms = episodes.find((e) => e.bookName === 'Psalms');
    assert.ok(psalms);
    assert.equal(psalms.totalBookChapters, 150);
    assert.ok(psalms.chapters.length >= 10);

    const revelation = episodes[66];
    assert.equal(revelation.bookNum, 66);
    assert.equal(revelation.bookName, 'Revelation');
    assert.equal(revelation.youtubeId, '_MwOTnyQ0XA');
    assert.equal(revelation.totalBookChapters, 22);
    assert.equal(revelation.chapters.length, 22);

    // Every single one of the 67 videos must have at least 1 chapter marker and a valid 11-char YouTube ID
    let totalChapters = 0;
    for (const ep of episodes) {
      assert.match(ep.youtubeId, /^[a-zA-Z0-9_-]{11}$/);
      assert.ok(ep.chapters.length > 0, `Expected chapters for ${ep.bookName}`);
      totalChapters += ep.chapters.length;
    }
    assert.equal(totalChapters, 941);
  });

  it('builds horizontal 16:9 video slide + chunked chapter link slides + study notes slide for each book', () => {
    const raw = JSON.parse(fs.readFileSync(scourbyJsonPath, 'utf8'));
    const episodes = normalizeJsonEpisodes(raw.episodes);
    const revelation = episodes[66]; // 22 chapter markers -> 1 video + ceil(22/9)=3 chapter slides + 1 notes = 5 slides
    const cards = buildEpisodeCards(revelation);
    assert.equal(cards[0].type, 'video');
    assert.equal(cards[1].type, 'chapters');
    assert.equal(cards[cards.length - 1].type, 'notes');
    assert.equal(cards.length, 5);
  });

  it('verifies public/feeds/scourby-kjv.xml RSS 2.0 feed contains all 67 items', () => {
    const xml = fs.readFileSync(scourbyXmlPath, 'utf8');
    const itemMatches = xml.match(/<item>/g) || [];
    assert.equal(itemMatches.length, 67);
    assert.ok(xml.includes('<yt:videoId>OgFT_IxwJJY</yt:videoId>'));
  });

  it('parses chapter timestamps and formats durations/autolinks cleanly', () => {
    const sample = `0:00 Genesis 1\n3:42 Genesis 2\n1:02:15 Genesis 20`;
    const ch = parseChaptersFromDescription(sample);
    assert.deepEqual(ch, [
      { timecode: '0:00', seconds: 0, label: 'Genesis 1' },
      { timecode: '3:42', seconds: 222, label: 'Genesis 2' },
      { timecode: '1:02:15', seconds: 3735, label: 'Genesis 20' }
    ]);
    assert.equal(formatDuration(3735), '1h 02m');
    assert.equal(formatTimecode(222), '3:42');
    const linked = autolinkText('Watch at https://www.youtube.com/watch?v=OgFT_IxwJJY.');
    assert.ok(linked.includes('href="https://www.youtube.com/watch?v=OgFT_IxwJJY"'));
  });

  it('verifies rotation/fullscreen state lock guards and service worker v2 cache bump', () => {
    const sw = fs.readFileSync(path.resolve(__dirname, '../public/sw.js'), 'utf8');
    assert.ok(sw.includes("wnp-bible-shell-v2"));

    const deckSrc = fs.readFileSync(path.resolve(__dirname, '../src/deck.ts'), 'utf8');
    assert.ok(deckSrc.includes('lockAndRestoreActivePosition'));
    assert.ok(deckSrc.includes('isLayoutLocked'));
    assert.ok(deckSrc.includes('orientationchange'));

    const playerSrc = fs.readFileSync(path.resolve(__dirname, '../src/player.ts'), 'utf8');
    assert.ok(playerSrc.includes('isFullscreenActive'));
    assert.ok(playerSrc.includes('wnp:fullscreen-exit'));
  });
});
