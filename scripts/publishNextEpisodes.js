const fs = require('fs');
const path = require('path');

// ⚙ Einstellungen
const MAX_NEW_ITEMS = 2;
const EPISODES_DIR = path.join(__dirname, '../docs/Episoden');
const FEED_PATH = path.join(__dirname, '../docs/feed.xml');

// Hilfsfunktion: Einrückung für lesbare XML
function indent(str, level = 2) {
  return str
    .split('\n')
    .map(line => ' '.repeat(level) + line)
    .join('\n');
}

// 🧠 JSON → <item>-Block im Podcast-Feed
function jsonToItem(json) {
  const personBlock = [];

  if (json["Host"]) {
    personBlock.push(
      `<podcast:person role="host" href="${json["Host Link"] || ""}">${json["Host"]}</podcast:person>`
    );
  }

  if (json["Gast 1"]) {
    personBlock.push(
      `<podcast:person role="guest"${json["Gast 1 Link"] ? ` href="${json["Gast 1 Link"]}"` : ""}>${json["Gast 1"]}</podcast:person>`
    );
  }

  if (json["Gast 2"]) {
    personBlock.push(
      `<podcast:person role="guest">${json["Gast 2"]}</podcast:person>`
    );
  }

  const [lat, lon] = json.Koordinaten?.split(';') || [];
  const keywords = json.Tags?.join(', ') || '';

  // Inline-Chapter
  let chaptersBlock = '';
  if (Array.isArray(json.Timestamps) && json.Timestamps.length > 0) {
    const chapters = json.Timestamps.map(ts =>
      `<podcast:chapter start="${ts.start}" title="${ts.title}" />`
    ).join('\n    ');
    chaptersBlock = `
  <podcast:chapters version="1.0">
    ${chapters}
  </podcast:chapters>`;
  }

  return `
<item>
  <title>${json.title}</title>
  <link>${json.link}</link>
  <itunes:subtitle>${json.subtitle}</itunes:subtitle>
  <itunes:summary>${json["summary/description"]}</itunes:summary>
  <description>${json["summary/description"]}</description>
  <pubDate>${json.pubDate.trim()}</pubDate>
  <enclosure url="${json["Sound Link"]}" length="${json["Sound bites"]}" type="${json["File Type"]}" />
  <guid isPermaLink="false">${json.guid}</guid>
  <itunes:image href="${json["Bild Link"]}" />
  <itunes:season>${json.Season}</itunes:season>
  <itunes:episode>${json.Episode}</itunes:episode>
  <itunes:episodeType>full</itunes:episodeType>
  <itunes:explicit>no</itunes:explicit>
  <itunes:duration>${json.Duration}</itunes:duration>
  ${keywords ? `<itunes:keywords>${keywords}</itunes:keywords>` : ''}
  ${personBlock.join('\n  ')}
  <podcast:location lat="${lat}" lon="${lon}">${json.Ort}</podcast:location>
  <podcast:funding url="${json.Funding}">${json["Funding Satz"]}</podcast:funding>${chaptersBlock}
</item>`;
}

// 🧠 GUIDs aus feed.xml extrahieren
function getPublishedGuids(feedContent) {
  const guidRegex = /<guid[^>]*>(.*?)<\/guid>/g;
  const guids = [];
  let match;
  while ((match = guidRegex.exec(feedContent))) {
    guids.push(match[1]);
  }
  return guids;
}

// 🧠 Neue <item>-Blöcke einfügen (vor </channel>)
function insertItemsIntoFeed(feedXml, newItemsXml) {
  return feedXml.replace(
    /<\/channel>\s*<\/rss>/,
    `${newItemsXml.join('\n\n')}\n\n</channel>\n</rss>`
  );
}

// 🔁 Hauptfunktion
function main() {
  if (!fs.existsSync(FEED_PATH)) {
    console.error('❌ feed.xml nicht gefunden.');
    process.exit(1);
  }

  const feedXml = fs.readFileSync(FEED_PATH, 'utf8');
  const publishedGuids = getPublishedGuids(feedXml);

  const jsonFiles = fs
    .readdirSync(EPISODES_DIR)
    .filter(f => f.endsWith('.json'))
    .sort((a, b) => {
  const jsonA = JSON.parse(fs.readFileSync(path.join(EPISODES_DIR, a), 'utf8'));
  const jsonB = JSON.parse(fs.readFileSync(path.join(EPISODES_DIR, b), 'utf8'));

  const matchA = jsonA.Nummer?.match(/\d+/g);
  const matchB = jsonB.Nummer?.match(/\d+/g);

  if (!matchA || !matchB || matchA.length < 3 || matchB.length < 3) return 0;

  const [jahrA, sA, dA] = matchA.map(Number);
  const [jahrB, sB, dB] = matchB.map(Number);

  if (jahrA !== jahrB) return jahrA - jahrB;
  if (sA !== sB) return sA - sB;
  return dA - dB;
});



  const newItems = [];

  for (const file of jsonFiles) {
    if (newItems.length >= MAX_NEW_ITEMS) break;

    const jsonPath = path.join(EPISODES_DIR, file);
    const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    if (!json.guid || publishedGuids.includes(json.guid)) continue;

    newItems.push(jsonToItem(json));
  }

  if (newItems.length === 0) {
    console.log('✅ Keine neuen Episoden zum Veröffentlichen gefunden.');
    return;
  }

  const updatedFeed = insertItemsIntoFeed(feedXml, newItems.map(i => indent(i, 2)));
  fs.writeFileSync(FEED_PATH, updatedFeed);
  console.log(`✅ ${newItems.length} neue Episode(n) veröffentlicht.`);
}

main();
