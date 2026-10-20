// Checks every pending post before Ray merges (runs on each pull request). No API key needed.
import fs from 'node:fs';
import path from 'node:path';
const channels = JSON.parse(fs.readFileSync('channels.json', 'utf8'));
const LIMITS = { 'ray-x': 280, 'vault-x': 280, 'ray-linkedin': 3000, 'vault-instagram': 2200, 'vault-facebook': 5000, 'vault-youtube': 5000 };
const BANNED = [/sketchup/i, /revolutionary/i, /game[- ]changing/i, /\bmagic\b/i];
let errors = 0;
const err = (m) => { console.log('❌ ' + m); errors++; };
for (const f of fs.readdirSync('posts/pending').filter(f => f.endsWith('.json'))) {
  let b;
  try { b = JSON.parse(fs.readFileSync(path.join('posts/pending', f), 'utf8')); } catch (e) { err(`${f}: not valid JSON`); continue; }
  if (!Array.isArray(b.posts) || !b.posts.length) { err(`${f}: no posts`); continue; }
  for (const p of b.posts) {
    const tag = `${f} · ${p.channel} · ${p.at}`;
    if (!(p.channel in channels)) err(`${tag}: unknown channel`);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(p.at || '')) err(`${tag}: "at" must be YYYY-MM-DDTHH:MM (Bucharest)`);
    if (!p.text) err(`${tag}: empty text`);
    // X counts every link as 23 characters
    const len = (p.text || '').replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length;
    if (LIMITS[p.channel] && len > LIMITS[p.channel]) err(`${tag}: ${len} chars, limit ${LIMITS[p.channel]}`);
    for (const r of BANNED) if (r.test(p.text || '')) err(`${tag}: banned word ${r}`);
    for (const t of [p.text || '', p.firstComment || '']) if (/vaultworkspace\.com/.test(t) && !/utm_source=/.test(t)) err(`${tag}: Vault link without utm tag`);
    for (const m of p.media || []) if (!/^https?:/.test(m) && !fs.existsSync(m)) err(`${tag}: media missing ${m}`);
    if (['vault-instagram', 'vault-youtube'].includes(p.channel) && !(p.media || []).length) err(`${tag}: ${p.channel} needs media`);
  }
}
console.log(errors ? `${errors} problem(s)` : '✅ All posts look good');
process.exit(errors ? 1 : 0);
