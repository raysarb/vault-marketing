// Schedules approved posts (posts/pending/*.json) in Buffer, then moves them to posts/scheduled/.
// Runs only in GitHub Actions after Ray merges a pull request. Needs secret BUFFER_API_KEY.
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.buffer.com';
const KEY = process.env.BUFFER_API_KEY;
const MEDIA_BASE = (process.env.MEDIA_BASE || '').replace(/\/$/, '');
const DRY = process.argv.includes('--dry-run');
const TZ = 'Europe/Bucharest';

async function gql(query, variables = {}) {
  if (!KEY) throw new Error('BUFFER_API_KEY secret is missing');
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.errors) throw new Error(`Buffer API ${r.status}: ${JSON.stringify(j.errors || j)}`);
  return j.data;
}

export async function listChannels() {
  const a = await gql('query { account { organizations { id name } } }');
  const out = [];
  for (const org of a.account.organizations) {
    const c = await gql('query($id: OrganizationId!) { channels(input: { organizationId: $id }) { id name service } }', { id: org.id })
      .catch(() => gql(`query { channels(input: { organizationId: "${org.id}" }) { id name service } }`));
    for (const ch of c.channels) out.push({ org: org.name, ...ch });
  }
  return out;
}

// "2026-10-22T16:00" in Bucharest time -> ISO UTC
function toUtc(local) {
  const [d, t] = local.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  let guess = Date.UTC(y, mo - 1, da, h, mi);
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(guess)).map(p => [p.type, p.value]));
    const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    guess += Date.UTC(y, mo - 1, da, h, mi) - shown;
  }
  return new Date(guess).toISOString();
}

async function waitForUrl(url) {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(url, { method: 'HEAD' }).catch(() => null);
    if (r && r.ok) return;
    await new Promise(s => setTimeout(s, 15000));
  }
  throw new Error(`Media not reachable: ${url}`);
}

const CREATE = `mutation($input: CreatePostInput!) {
  createPost(input: $input) {
    ... on PostActionSuccess { post { id dueAt } }
    ... on MutationError { message }
  }
}`;

async function main() {
  if (process.argv.includes('--channels')) {
    const ch = await listChannels();
    console.log(JSON.stringify(ch, null, 2));
    for (const c of ch) console.log(`::notice title=channel::${c.service} | ${c.name} | ${c.id}`);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '| Name | Service | Channel id |\n|---|---|---|\n' + ch.map(c => `| ${c.name} | ${c.service} | \`${c.id}\` |`).join('\n') + '\n');
    return;
  }
  const channels = JSON.parse(fs.readFileSync('channels.json', 'utf8'));
  const dir = 'posts/pending';
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const report = [];
  let failed = false;
  for (const f of files) {
    const batch = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const p of batch.posts) {
      if (p.result?.id) continue; // already scheduled on an earlier run
      const channelId = channels[p.channel];
      try {
        if (!channelId) throw new Error(`Unknown channel "${p.channel}" (add it to channels.json)`);
        const dueAt = toUtc(p.at);
        if (new Date(dueAt) < new Date(Date.now() + 5 * 60000)) throw new Error(`Time ${p.at} is in the past; not posted`);
        const assets = [];
        for (const m of p.media || []) {
          const url = /^https?:/.test(m) ? m : `${MEDIA_BASE}/${m}`;
          if (!DRY) await waitForUrl(url);
          assets.push(/\.(mp4|mov|webm)$/i.test(m) ? { video: { url } } : { image: { url } });
        }
        const input = { text: p.text, channelId, schedulingType: 'automatic', mode: 'customScheduled', dueAt };
        if (assets.length) input.assets = assets;
        if (p.metadata) input.metadata = p.metadata;
        if (DRY) { report.push(`DRY ${p.channel} ${p.at} ok`); continue; }
        const d = await gql(CREATE, { input });
        const res = d.createPost;
        if (res.message) throw new Error(res.message);
        p.result = { id: res.post.id, dueAt: res.post.dueAt };
        report.push(`✅ ${batch.id} · ${p.channel} · ${p.at}`);
      } catch (e) {
        failed = true;
        p.result = { error: String(e.message || e) };
        report.push(`❌ ${batch.id} · ${p.channel} · ${p.at}: ${p.result.error}`);
      }
    }
    if (!DRY) {
      const done = batch.posts.every(p => p.result?.id);
      const target = done ? path.join('posts/scheduled', f) : path.join(dir, f);
      fs.writeFileSync(target, JSON.stringify(batch, null, 2) + '\n');
      if (done) fs.unlinkSync(path.join(dir, f));
    }
  }
  console.log(report.join('\n') || 'Nothing to schedule.');
  for (const r of report) console.log(`::${r.startsWith('❌') ? 'error' : 'notice'} title=post::${r}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report.map(r => `- ${r}`).join('\n') + '\n');
  if (failed) process.exitCode = 1;
}

main().catch(e => { console.log(`::error title=buffer::${String(e.message || e).replace(/Bearer \S+/g, 'Bearer ***').slice(0, 900)}`); process.exit(1); });
