// Builds epg.xml for a playlist by matching its channels against public XMLTV feeds.
// Usage: node --max-old-space-size=4096 build.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const config = JSON.parse(fs.readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
const outDir = process.argv[2] || 'dist';
const playlistUrl = process.env.PLAYLIST_URL || config.playlistUrl;
const minChannels = Number(process.env.MIN_CHANNELS || config.minChannels);

const entities = { amp: '&', apos: "'", quot: '"', lt: '<', gt: '>' };
const dec = s => s.replace(/&(amp|apos|quot|lt|gt);/g, (_, e) => entities[e]);
const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const noise = new Set(['hd', 'sd', 'uhd', 'fhd', 'hq', 'channel', 'asia', 'philippines', 'ph', 'pinoy', 'network', 'the']);

const norm = s => dec(s).toLowerCase().replace(/\(.*?\)/g, ' ').replace(/\+/g, ' plus ').replace(/&/g, ' and ')
  .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w && !noise.has(w)).join('');
const keys = n => {
  const a = norm(n);
  return [...new Set([a, a.endsWith('tv') ? a.slice(0, -2) : a])].filter(Boolean);
};

async function download(url, gz) {
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return (gz ? zlib.gunzipSync(buf) : buf).toString('utf8');
}

const m3u = await download(playlistUrl, false);
const chans = [...m3u.matchAll(/#EXTINF:[^\n]*tvg-id="([^"]*)"[^\n]*,(.*)/g)]
  .map(m => ({ id: m[1], name: m[2].trim() }))
  .filter(c => c.id && !config.exclude.includes(c.id));
console.log(`playlist: ${chans.length} channels`);

const found = new Map(); // playlist id -> { source, sourceId }
const programmes = new Map(); // playlist id -> string[]
const body = [];

for (const src of config.sources) {
  const pending = chans.filter(c => !found.has(c.id));
  if (!pending.length) break;
  let xml;
  try {
    xml = await download(src.url, true);
  } catch (e) {
    console.warn(`skip ${src.name}: ${e.message}`);
    continue;
  }

  // index programmes by source channel id
  const byChannel = new Map();
  for (let i = 0; (i = xml.indexOf('<programme ', i)) >= 0;) {
    const end = xml.indexOf('</programme>', i) + 12;
    const seg = xml.slice(i, end);
    const k = dec(seg.match(/channel="([^"]*)"/)[1]);
    if (!byChannel.has(k)) byChannel.set(k, []);
    byChannel.get(k).push(seg);
    i = end;
  }
  const list = [...xml.matchAll(/<channel id="([^"]*)">([\s\S]*?)<\/channel>/g)].map(m => ({
    id: dec(m[1]),
    names: [...m[2].matchAll(/<display-name[^>]*>([^<]*)/g)].map(n => n[1]),
  })).filter(ch => byChannel.has(ch.id));

  let hits = 0;
  for (const c of pending) {
    const alias = config.alias[c.id];
    const ks = new Set([...keys(c.name), ...keys(c.id)]);
    const lev = (a, b) => { if (Math.abs(a.length - b.length) > 1) return 9; const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1)); return d[a.length][b.length]; };
    const fz = () => config.fuzzy && list.find(ch => [...ch.names, ch.id.replace(/.[a-z0-9_]{2,}$/i, '').replace(/[._]/g, ' ')].some(n => keys(n).some(k2 => k2.length >= 6 && [...ks].some(k => k.length >= 6 && (k === k2 || lev(k, k2) <= 1 || (Math.min(k.length, k2.length) >= 8 && (k.includes(k2) || k2.includes(k))))))));
    let fuzzy = false;
    const hit = (alias && list.find(ch => ch.id === alias)) ||
      list.find(ch => ch.names.some(n => keys(n).some(k => ks.has(k))) ||
        keys(ch.id.replace(/\.[a-z]{2}$/, '').replace(/\./g, ' ')).some(k => ks.has(k)));
    if (!hit) continue;
    found.set(c.id, { source: src.name, sourceId: hit.id });
    programmes.set(c.id, byChannel.get(hit.id));
    hits++;
  }
  console.log(`${src.name}: +${hits}`);
}

if (found.size < minChannels) {
  console.error(`only ${found.size} channels matched (< ${minChannels}); refusing to publish`);
  process.exit(1);
}

const out = ['<?xml version="1.0" encoding="UTF-8"?>',
  `<tv generator-info-name="ph-epg" generated="${new Date().toISOString()}">`];
let total = 0;
for (const c of chans) {
  if (!found.has(c.id)) continue;
  out.push(`  <channel id="${esc(c.id)}"><display-name>${esc(c.name)}</display-name></channel>`);
  for (const p of programmes.get(c.id)) {
    body.push('  ' + p.replace(/channel="[^"]*"/, `channel="${esc(c.id)}"`));
    total++;
  }
}
const xmlOut = out.concat(body, ['</tv>']).join('\n');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'epg.xml'), xmlOut);
fs.writeFileSync(path.join(outDir, 'epg.xml.gz'), zlib.gzipSync(xmlOut));
const report = chans.map(c => found.has(c.id) ? `OK       ${c.id} <- ${found.get(c.id).source}:${found.get(c.id).sourceId}` : `MISSING  ${c.id}`);
fs.writeFileSync(path.join(outDir, 'report.txt'),
  `generated ${new Date().toISOString()}\nmatched ${found.size}/${chans.length}, ${total} programmes\n\n${report.join('\n')}\n`);
fs.writeFileSync(path.join(outDir, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>PH EPG</title><h1>PH EPG</h1><ul><li><a href="epg.xml.gz">epg.xml.gz</a></li><li><a href="epg.xml">epg.xml</a></li><li><a href="report.txt">report.txt</a></li></ul><p>Updated ${new Date().toISOString()}</p>`);
console.log(`matched ${found.size}/${chans.length}, ${total} programmes -> ${outDir}`);
