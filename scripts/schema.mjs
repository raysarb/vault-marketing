// Prints Buffer's post input options (for metadata like Instagram collaborators). No secrets printed.
const KEY = process.env.BUFFER_API_KEY;
async function gql(query) {
  const r = await fetch('https://api.buffer.com', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, body: JSON.stringify({ query }) });
  return r.json();
}
const seen = new Set(); const out = [];
async function walk(name, depth) {
  if (seen.has(name) || depth > 4) return; seen.add(name);
  const j = await gql(`{ __type(name: "${name}") { name kind inputFields { name type { name kind ofType { name kind ofType { name kind ofType { name kind } } } } } enumValues { name } } }`);
  const t = j.data?.__type; if (!t) { out.push(`${name}: ${JSON.stringify(j.errors || j).slice(0, 300)}`); return; }
  if (t.enumValues) { out.push(`${name} = ${t.enumValues.map(e => e.name).join(' | ')}`); return; }
  for (const f of t.inputFields || []) {
    let ty = f.type; const chain = []; while (ty) { chain.push(ty.name || ty.kind); if (ty.name) break; ty = ty.ofType; }
    out.push(`${name}.${f.name}: ${chain.join(' ')}`);
  }
  for (const f of t.inputFields || []) { let ty = f.type; while (ty && !ty.name) ty = ty.ofType; if (ty && /Input|Meta|Enum|Type|Asset/i.test(ty.name) && !/^(String|Int|Boolean|ID|Float|DateTime)$/.test(ty.name)) await walk(ty.name, depth + 1); }
}
await walk('CreatePostInput', 0);
const keep = out.filter(l => !/^(CreatePostInput|ImageMetadataInput|ImageAssetInput|DocumentAssetInput|AssetInput)\./.test(l)); for (let i = 0; i < keep.length; i += 40) console.log(`::notice title=schema::${keep.slice(i, i + 40).join(" ;; ")}`);
