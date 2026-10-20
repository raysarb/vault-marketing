// Telegram approvals for post pull requests (branch post/*).
// Announces each new post PR to Ray with a preview; Ray replies "OK 7" (merge + schedule in Buffer) or "NO 7" (close).
// Only Ray's chat (TELEGRAM_CHAT_ID) is obeyed. Uses the repo's own GITHUB_TOKEN; no personal token.
// Telegram updates are read without confirming them, so other bot jobs (HQ music inbox) still see them.
import fs from 'node:fs';
const { TELEGRAM_BOT_TOKEN: TG, TELEGRAM_CHAT_ID: CHAT, GITHUB_TOKEN: GT, GITHUB_REPOSITORY: REPO } = process.env;
const STATE = 'posts/.approvals.json';
const st = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { last: 0, announced: [] };
const tg = async (m, body) => (await fetch(`https://api.telegram.org/bot${TG}/${m}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
const say = (text) => tg('sendMessage', { chat_id: CHAT, text: text.slice(0, 4000), disable_web_page_preview: true });
const gh = async (path, method = 'GET', body) => {
  const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, { method, headers: { Authorization: `Bearer ${GT}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`); return t ? JSON.parse(t) : {};
};
const waiting = async () => (await gh('/pulls?state=open&per_page=50')).filter(p => p.head.ref.startsWith('post/'));

// 1) Ray's replies
const ups = (await tg('getUpdates', { timeout: 0, allowed_updates: ['message'] })).result || [];
let prs = await waiting();
for (const u of ups) {
  if (u.update_id <= st.last) continue;
  st.last = u.update_id;
  const m = u.message || {};
  if (String(m.chat?.id) !== String(CHAT)) continue;
  const mt = (m.text || '').trim().match(/^(ok|yes|approve|no|reject)\s*#?(\d+)?$/i);
  if (!mt) continue;
  const ok = /^(ok|yes|approve)$/i.test(mt[1]);
  let num = mt[2] ? Number(mt[2]) : null;
  if (num === null) {
    if (prs.length !== 1) { await say(prs.length ? `Which one? Waiting: ${prs.map(p => '#' + p.number).join(', ')}. Reply e.g. OK ${prs[0].number}` : 'No posts are waiting.'); continue; }
    num = prs[0].number;
  }
  const pr = prs.find(p => p.number === num);
  if (!pr) { await say(`#${num} is not a waiting post.`); continue; }
  try {
    if (ok) {
      await gh(`/pulls/${num}/merge`, 'PUT', { merge_method: 'merge', commit_title: `Approved by Ray in Telegram (#${num})` });
      await gh('/actions/workflows/publish.yml/dispatches', 'POST', { ref: 'main' });
      await say(`✅ #${num} approved. Buffer schedules it in a few minutes.`);
    } else {
      await gh(`/pulls/${num}`, 'PATCH', { state: 'closed' });
      await say(`🗑 #${num} rejected. Nothing will be posted.`);
    }
  } catch (e) { await say(`⚠️ #${num}: ${e.message}`); }
  prs = await waiting();
}

// 2) Announce new post PRs
for (const pr of prs) {
  if (st.announced.includes(pr.number)) continue;
  const lines = [`📣 Post #${pr.number} waiting for you: ${pr.title}`];
  const media = new Set();
  for (const f of await gh(`/pulls/${pr.number}/files`)) {
    if (!/^posts\/pending\/.+\.json$/.test(f.filename)) continue;
    const raw = await (await fetch(`https://raw.githubusercontent.com/${REPO}/${pr.head.sha}/${f.filename}`)).json();
    for (const p of raw.posts || []) { lines.push(`\n— ${p.channel} · ${p.at.replace('T', ' ')}\n${p.text}`); (p.media || []).forEach(x => media.add(x)); }
  }
  lines.push(`\nReply OK ${pr.number} to approve or NO ${pr.number} to reject.`);
  await say(lines.join('\n'));
  for (const mp of [...media].slice(0, 2)) {
    const url = `https://raw.githubusercontent.com/${REPO}/${pr.head.sha}/${mp}`;
    const video = /\.(mp4|mov)$/i.test(mp);
    const r = await tg(video ? 'sendVideo' : 'sendPhoto', { chat_id: CHAT, [video ? 'video' : 'photo']: url, caption: `Media for #${pr.number}` });
    if (!r.ok) await say(`Media for #${pr.number}: ${url}`);
  }
  st.announced.push(pr.number);
}
st.announced = st.announced.slice(-200);
fs.writeFileSync(STATE, JSON.stringify(st) + '\n');
console.log('ok', st.last, prs.map(p => p.number));
