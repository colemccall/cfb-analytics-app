# cfb-analytics export, v1

The data contract for projects that read this one's numbers without reading its code (cfb-analytics-sim, cfb-analytics-game).
`schema.json` beside this file is the definition. It holds every field's type, meaning, source and range, and the vocabulary of
reasons a value can be null. This page only says how to use it.

| File | What it is |
|---|---|
| `manifest.json` | the season, the last complete week, when it was exported, the release and model fingerprint that made it, row counts, each file's sha256 |
| `schema.json` | every field of every file, and the rules below |
| `teams.json` | one row per FBS team: identity, colours, last season's rating, this season's projection and rating to date, record |
| `players.json` | one row per player on a roster this season: identity, size, recruiting, and three ratings kept apart |

**Layout.** Each data file is `{"fields": [...], "rows": [[...], ...]}`. Zip a row with `fields` to get a record:

```js
const { fields, rows } = await (await fetch("players.json")).json();
const players = rows.map(r => Object.fromEntries(fields.map((f, i) => [f, r[i]])));
```

**Nulls.** A null always comes with a reason. Every row has a `nulls` field mapping each null field to a code from
`schema.json`'s `null_reasons`, for example `{"rating_to_date": "withheld_ol"}`. There are no default numbers: a lineman's rating is
null with `withheld_ol`, not 50, and a player with no box-score row has null games, not 0. Treat an unknown code as "unknown".

**Three ratings, never merged.** `rating_prev` is last season, earned. `projection` is this season's preseason number.
`rating_to_date` is this season, earned so far. They answer different questions; averaging them answers none of them.

**What the ratings are.** Box-score production adjusted for the opponent, on a fixed 30–99 scale with absolute anchors. They are
not physical attributes (speed, strength, accuracy), and v1 has no per-play data.

**Stability.** Within v1, no field is removed, renamed or redefined, and no reason code changes meaning. New fields and new reason
codes may be added; the manifest's `version` minor number rises when they are. A breaking change ships as `exports/v2/` beside v1.

**Freshness.** The export is rewritten after each weekly refresh (`cfb-analytics-pipeline/scripts/21_export_contract.py`).
`manifest.json` says which week it reflects. For numbers that never change, use the frozen snapshots in `../../snapshots/`.
