# TUS Defter

A private study tracker for TUS preparation. Phone-first web app (PWA), installed from Safari with **Share → Add to Home Screen**.

- **Salon** (opener): time since last study, Anki chain, today/week, quick add.
- **Mutfak** (detail): chain + subjects you have neglected, the 25 Şampiyonların Notu volumes (start → fill → read 1/2/3), subject pages with Anki sub-deck state and an editable log.

This repo holds code only. **No personal data lives here.** The data lives in the private repo `baturalpalooza/tus-data` as `data.json`, read and written with a fine-grained GitHub token that is stored only on each device.

## Files

| File | What it does |
|---|---|
| `index.html` | Page shell, fonts, iOS home-screen tags |
| `style.css` | Both looks: Salon (sunset, calm) and Mutfak (ledger, ink, one orange) |
| `core.js` | Data model, derived stats, merge. No DOM; testable in Node |
| `sync.js` | GitHub Contents API pull / merge / push |
| `app.js` | UI and events |
| `sw.js` | Offline cache. **Bump `VERSION` on every release** |
| `tests/` | `node tests/core.test.js` |

## Data format (`tus-data/data.json`)

```json
{ "version": 1, "events": [ { "id": "…", "t": "2026-11-24T18:30:00.000Z", "by": "app", "type": "study", "date": "2026-11-24", "subject": "patoloji", "minutes": 90, "questions": 40 } ] }
```

Append-only event log. Never edit or remove an event: to undo, set `"deleted": true` (and `"deletedAt"`). Merge = union by `id`; `deleted` wins. Every event has `id` (unique string), `t` (ISO time it was logged), `by` (`app` or `claude`), `type`, `date` (local `YYYY-MM-DD` it counts for).

| `type` | Extra fields |
|---|---|
| `study` | `subject`, `minutes`, optional `questions`, optional `note` |
| `anki` | optional `minutes` (30 or 60) |
| `book` | `book` (`<subject>-<vol>`, e.g. `patoloji-1`), `action`: `start` \| `filled` \| `readStart` \| `readDone` |
| `deck` | `subject`, `state`: `locked` \| `open` \| `newDone` \| `review` |

Subject ids: `anatomi, fizyoloji, biyokimya, mikrobiyoloji, patoloji, farmakoloji, dahiliye, pediatri, genel-cerrahi, kadin-dogum, kucuk-stajlar`. Volumes: Anatomi 1; Fizyoloji, Biyokimya, Mikrobiyoloji, Patoloji, Farmakoloji 2 each; Dahiliye 4; Pediatri 3; Genel Cerrahi 2; Kadın Doğum 2; Küçük Stajlar 3 (25 total).

**When Claude logs for the user:** append events with `"by": "claude"` and a fresh unique `id`, commit to `tus-data` `main`. The app merges them on its next sync.

## Token (per device)

GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token. Repository access: **Only select repositories → tus-data**. Permissions: **Contents: Read and write**. Paste it in the app (first screen, or ⚙ Ayarlar).
