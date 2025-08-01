const fs = require('fs');
const path = require('path');

const EPISODES_DIR = path.join(__dirname, '../docs/Episoden');
const FEED_PATH = path.join(__dirname, '../docs/feed.xml');
const MAX_ITEMS = 1;

function parsePubDate(str) {
  const cleaned = str.trim().replace(',', ''); // "Fri 01 Aug 2025 15:00:00 +0200"
  const parsed = new Date(cleaned);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function indent(str, level = 2) {
  return str
    .split('\n')
    .map(line => ' '.repeat(level) + line)
    .join('\n');
}

function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getPublishedGuids(feedContent) {
  const guidRegex = /<guid[^>]*>(.*?)<\/guid>/g;
  const guids = [];
  let match;
  while ((match = guidRegex.exec(feedContent))) {
    guids.push(match[1]);
  }
  return guids;
}

function insertItemsIntoFeed(feedXml, newItemsXml) {
  return feedXml.replace(
    /<\/channel>\s*<\/rss>/,
    `${newItemsXml.join('\n\n')}\n\n</channel>\n</rss>`
  );
}

function jsonToItem(json) {
  const personBlock = [];

  if (json["Host"]) {
    personBlock.push(
      `<podcast:person role="host" href="${json["Host Link"] || ""}">${escapeXml(json["Host"])}</podcast:person>`
    );
  }

  if (json["Gast 1"]) {
    personBlock.push(
      `<podcast:person role="guest"${json["Gast 1 Link"] ? ` href="${json["Gast 1 Link"]}"` : ""}>${escapeXml(json["Gast 1"])}</podcast:person>`
    );
  }

  if (json["Gast 2"]) {
    personBlock.push(
      `<podcast:person role="guest"${json["Gast 2 Link"] ? ` href="${json["Gast 2 Link"]}"` : ""}>${escapeXml(json["Gast 2"])}</podcast:person>`
    );
  }

  const [lat, lon] = json.Koordinaten?.split(';') || [];
  const keywords = json.Tags?.join(', ') || '';

  let chaptersBlock = '';
  if (Array.isArray(json.Timestamps) && json.Timestamps.length > 0) {
    const chapters = json.Timestamps.map(ts =>
      `<podcast:chapter start="${ts.start}" title="${escapeXml(ts.title)}" />`
    ).join('\n    ');
    chaptersBlock = `
  <podcast:chapters version="1.0">
    ${chapters}
  </podcast:chapters>`;
  }

  return `
<item>
  <title>${escapeXml(json.title)}</title>
  <link>${json.link}</link>
  <itunes:subtitle>${escapeXml(json.subtitle)}</itunes:subtitle>
  <itunes:summary>${escapeXml(json["summary/description"])}</itunes:summary>
  <description>${escapeXml(json["summary/description"])}</description>
  <pubDate>${json.pubDate.trim()}</pubDate>
  <enclosure url="${json["Sound Link"]}" length="${json["Sound bites"]}" type="${json["File Type"]}" />
  <guid isPermaLink="false">${json.guid}</guid>
  <itunes:image href="${json["Bild Link"]}" />
  <itunes:season>${json.Season}</itunes:season>
  <itunes:episode>${json.Episode}</itunes:episode>
  <itunes:episodeType>full</itunes:episodeType>
  <itunes:explicit>no</itunes:explicit>
  <itunes:duration>${json.Duration}</itunes:duration>
  ${keywords ? `<itunes:keywords>${escapeXml(keywords)}</itunes:keywords>` : ''}
  ${personBlock.join('\n  ')}
  <podcast:location lat="${lat}" lon="${lon}">${escapeXml(json.Ort)}</podcast:location>
  <podcast:funding url="${json.Funding}">${escapeXml(json["Funding Satz"])}</podcast:funding>${chaptersBlock}
</item>`;
}

function main() {
  const now = new Date();
  const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;

  const feedXml = fs.readFileSync(FEED_PATH, 'utf8');
  const publishedGuids = getPublishedGuids(feedXml);

  const files = fs.readdirSync(EPISODES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const json = JSON.parse(fs.readFileSync(path.join(EPISODES_DIR, f), 'utf8'));
      return { json, file: f };
    })
    .filter(e => e.json && e.json.guid && !publishedGuids.includes(e.json.guid))
    .filter(e => {
      const pubDate = parsePubDate(e.json.pubDate);
      if (!pubDate || pubDate > now) return false;

      const ageInMs = now - pubDate;
      return ageInMs <= sevenDaysInMs;
    })
    .sort((a, b) => parsePubDate(a.json.pubDate) - parsePubDate(b.json.pubDate));

  const toPublish = files.slice(0, MAX_ITEMS);

  if (toPublish.length === 0) {
    console.log('🟡 Keine Episoden fällig (oder pubDate älter als 7 Tage).');
    return;
  }

  const newItems = toPublish.map(e => indent(jsonToItem(e.json), 2));
  const updatedFeed = insertItemsIntoFeed(feedXml, newItems);
  fs.writeFileSync(FEED_PATH, updatedFeed);
  console.log(`✅ Veröffentlicht: ${toPublish.map(e => e.json.guid).join(', ')}`);
}

main();
