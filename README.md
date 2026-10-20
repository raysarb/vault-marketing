# vault-marketing

Vault Workspace social posts. **Agents prepare, Ray approves by merging.**

1. An agent opens a pull request: `posts/pending/<date>-<slug>.json` + files in `media/<date>-<slug>/`.
2. "Check posts" runs: character limits, banned words (SketchUp, hype words), UTM links, media present.
3. Ray reviews on his phone (GitHub app → Files changed) and taps **Merge**. Closing the PR = rejected.
4. "Schedule in Buffer" puts the media online (GitHub Pages) and schedules every post in Buffer at its time. Results move the file to `posts/scheduled/`. Any error shows as ❌ in the run summary and the post is not published.

Media is public once merged (it's about to be posted anyway). Don't put anything private here.

## Post file
```json
{
  "id": "2026-10-22-change-materials",
  "posts": [
    { "channel": "vault-x", "at": "2026-10-22T16:00",
      "text": "One click. New floor. Same room.\nhttps://www.vaultworkspace.com/?utm_source=x&utm_medium=social&utm_campaign=change-materials",
      "media": ["media/2026-10-22-change-materials/16x9.mp4"] }
  ]
}
```
`at` is Bucharest time. Channels: see `channels.json` (`ray-x`, `ray-linkedin`, `vault-x`, `vault-instagram`, `vault-facebook`, `vault-youtube`). Optional `metadata` is passed to Buffer as-is.

## One-time setup (Ray)
1. Settings → Pages → Source: **GitHub Actions**.
2. Buffer → Settings → API → create key. GitHub → Settings → Secrets and variables → Actions → New secret `BUFFER_API_KEY`.
3. Connect the channels in Buffer. Actions → **List Buffer channels** → Run. Send the summary table to Claude (ids only, no key) to fill `channels.json`.

## Options per post
- `firstComment`: not supported on Buffer free plan; if set, it is appended to the post text. Put links in the text.
- `schedulingType`: `automatic` (default, every channel) or `notification` (needs the Buffer phone app; not used). Instagram allows max 5 hashtags. Collaborators cannot be added by the API: tag @raysarb... in the caption instead.
- Instagram video = Reel, shared to feed (and to Facebook through Instagram's auto-share).
