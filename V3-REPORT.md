# Token Launch Radar v3 — finish report (radar-4)

Entry: `token-radar-01` ($1,325). Base: v2 commit `a0efbcf` (radar-3).
Standing when finished: v2 rank #3505 of 6,184, judge 850,345; top-10 cutoff
957,219 (needs ~+107k). Entries close 2026-12-14T10:00:00Z.
This report finishes an interrupted v3 build: the previous builder's
model + dashboard changes were reconstructed from `git diff HEAD`, validated
offline, fixed where they overclaimed, verified, and screenshotted.
No repo was created, pushed, bundled, or submitted here.

## 1. What changed vs v2, and the pre-flight verdict for each change

Rule applied: a change only counts if it improves out-of-sample error on
BOTH validations (5-fold CV + time split by `listed_at`, median factor
error). Offline validation was re-run independently in pure Python,
replicating the TS `ols` / mulberry32 / CV / time-split exactly, on the
kit snapshot (`as_of` 2026-11-14, 758 protocols, 40 watchlist, 92 clean
comps; time-split halves n=35 each). It reproduces the program's numbers
exactly.

### Change 1 — model radar-3 → radar-4: size-plus-chains. KEEP.

Pure size (v2): `log10(mcap) = 3.958 + 0.394·log10(TVL)`.
Size-plus-chains (v3): `log10(mcap) = 4.132 + 0.387·log10(TVL) − 0.085·log1p(chains)`,
fit by OLS on the 92 clean comps at runtime (no hardcoded coefficients,
no hardcoded protocol names).

| validation | pure size (v2) | size+chains (v3) | verdict |
|---|---|---|---|
| 5-fold CV, median factor (seed 7) | x3.33 (37% within 2x) | **x2.94 (37%)** | better |
| forward time split (train older, test newer) | x2.11 (46%) | **x2.10 (49%)** | better, marginally (Δ=0.009) |
| reverse time split (train newer, test older) | x2.57 (31%) | **x2.11 (46%)** | better, strongly |

Multi-seed CV (seeds 1–10): pure size median-of-seeds 3.34 (mean 3.41);
size+chains median-of-seeds 3.15 (mean 3.26); size+chains beats pure size
on **9/10 seeds** (deltas mostly −0.16 to −0.39; one loss on seed 10,
+0.207). Chains coefficient is negative in all 5 seed-7 CV folds
(−0.051 to −0.134) and in **46/50 folds across seeds 1–10** (92%).

Honest caveat (fixed in the wording, see §2): the bootstrap 90%
interval for the chains coefficient runs **−0.261 to +0.081 — it crosses
zero**. So the discount is real on average but its sign is not certain
at the 90% level. The strict rule (improve OOS on both validations) is
satisfied — clearly on CV, strongly on the reverse split, marginally on
the forward split — so the term is kept, and the report leans on CV +
reverse split as the real evidence, not the forward split alone.
Effect size: ~6–13% lower implied value from 1 to 10 chains at the
fitted coefficient.

### Change 2 — bootstrap prediction intervals (200 resamples, seeded). KEEP.

Every row now carries `implied_low_usd` / `implied_high_usd` (5th–95th
percentile of 200 seeded resample fits) plus a bootstrap panel in the
dashboard Method section (coefficient ranges: a 2.638 / 4.099 / 5.772;
b 0.189 / 0.397 / 0.607; c −0.261 / −0.088 / +0.081). This does not
change any point estimate, so it needs no OOS test of its own — it
quantifies the uncertainty of Change 1 and drives Change 3. It is a
credibility addition for criterion 2 (value model), and it is what
lets the farm verdicts be netted at the low end instead of the median.

### Change 3 — farm verdicts FARM / THIN / SKIP, netted at the low end. KEEP.

Rule (`farmVerdict`): FARM if total gas ≤ $10 and low end ≥ $10M; SKIP
if total gas ≥ $40 or low end < $4M; else THIN. Counts on the board:
**FARM 12 / THIN 82 / SKIP 104** (SKIP reasons: gas ≥ $40 on 56 rows,
low end < $4M on 54 rows — roughly even, defensible). Verdict badges
replace the old "no token" status in the board, there is a verdict sort,
and the farm plan's last step states the verdict outright. This is a
decision rule built on the validated model + gas costs, not a new model,
so no separate OOS test applies. It is the concrete, costed-plan lever
for criterion 3.

### Change 4 — backtest table + scatter chart. KEEP.

All 92 comps predicted out of sample (leave-fold-out), shown as a
scatter chart (amber diagonal = exact, shaded band = within 2x) and a
worst-5 table in the dashboard. This IS the CV result displayed
(CV x2.94), not a new model — no separate OOS test needed. It makes the
validation visible instead of asserted, for criterion 2.

### Change 5 — full 5-feature model (size+chains+age+growth). TESTED, DROPPED.

Full model: CV **x3.43** (worse than x2.94), forward time split **x1.98**
(better than x2.10), reverse time split **x2.70** (worse than x2.11).
It does NOT beat size+chains on both validations (CV and reverse split
are both worse), so **growth/age stays dropped**, per the pre-flight
rule. The code already drops it; the decision string in the output
confirms it ("CV x3.43 vs x2.94, time split x1.98 vs x2.10, so the
model stays size plus chains"). The dashboard Method panel states this
decision with the numbers.

### Change 6 — research note + Method panel rewritten for radar-4. KEEP.

Explains why chains, the bootstrap stability, and the backtest worst-5.
No model content; no OOS test applies.

## 2. Fixes made while finishing (not in the interrupted builder's diff)

1. **Overclaim wording — fixed in 3 places.** The interrupted builder
   wrote "The chains coefficient stays negative throughout" (dashboard)
   and "negative in every cross-validation fold (… across the
   bootstrap)" (research note), with the bootstrap range (−0.261 to
   +0.081) sitting next to it. That is false for the bootstrap: the
   interval crosses zero. Corrected everywhere to the honest version:
   negative in the full fit and in 46 of 50 CV folds across 10 seeds;
   bootstrap 90% interval −0.26 to +0.08, so the discount is real on
   average but its sign is not certain. The header comment in
   `lib/model.ts` was made precise the same way (was: "negative in
   every fold" / "tying the forward time split"; now: 46/50 folds,
   "edges the forward time split (x2.10 vs x2.11)").
2. **`predict` family second step restored** in `familySecond`
   (`lib/model.ts`): the interrupted builder's diff had deleted the
   `case 'predict'` line, so the 1 predict-family board row (Predict
   Fun) fell back to the generic default. Restored:
   "Settle the first Predict Fun market on Binance and place a second,
   smaller position the next week."
3. `main.ts` comment references a `token-radar-01-kit-v3` path — comment
   only, left as-is (harmless).

## 3. Verification (run after the fixes)

Two `main.ts` runs, byte-identical:
- `board.json` sha256 `2aaf4880ade0f5c860d895de660ac8a654a98d96a24026fd2ac48cc962f0884d`
- `dossier.json` sha256 `d72f60e9d47733e5359412301cfd3dd17462d453eca41a497a3f25be2e0819e8`
  (both runs; the dossier embeds the 4 new screenshots, §4)
- `data.js` sha256 `18fc7e19c8db843f3024be740287ac4850099cd35032d1d3f8f38757370d66d7`
- Runtime log, both runs: `radar-4: fit log10(mcap) = 4.132 + 0.387 *
  log10(TVL) + -0.085 * log1p(chains) on 92 comps`; `CV median x2.94
  (37% within 2x), time split median x2.10 (49% within 2x), reverse
  time split x2.11 (46% within 2x)`; `bootstrap 200 resamples, chains
  coef -0.261 to 0.081`; `growth/age dropped`; `verdicts FARM 12,
  THIN 82, SKIP 104`.

Gates (checked on `out/`):
- 198 rows; ranks exactly 1..198; implied values strictly decreasing,
  all positive ints; watchlist 40/40 (nothing missing).
- Farm steps: **1,584 total, ALL unique**; 3–12 per row; every step
  20–600 chars; step 1 unique across all 198 rows (the v1
  templated-step-1 problem stays fixed).
- Every row's bootstrap band contains its implied value
  (`implied_low ≤ implied ≤ implied_high`).
- Dashboard static: no `http://` or `https://` in `index.html` /
  `app.css` / `app.js`; total dashboard source **31,397 bytes < 64 KB**.
  `research.md` (6,335 bytes) is written into `out/dashboard/`.
- Dossier: **825,121 bytes** (cap 1.5 MiB). Smaller than v2's
  1,026,445 bytes only because the new screenshots compress smaller
  (total ~589 KB vs v2's ~749 KB); content is richer (bootstrap +
  backtest + verdicts). The 1.2–1.4 MB design target is still not
  reached, and was deliberately not padded.
- Top 5: 1. Steakhouse Financial $37,198,711 (low $12,914,754, high
  $105,360,950, FARM); 2. USDD $31,840,618 (FARM); 3. Veda
  $28,995,792 (FARM); 4. Gauntlet $28,707,247 (FARM); 5. Nonce Capital
  $25,497,765 (SKIP). Implied range $37,198,711 → $5,021,581.
- Runtime fit matches the offline validation numbers exactly
  (a=4.132, b=0.387, c=−0.085; CV x2.94, TS x2.10, RTS x2.11).

## 4. Screenshots — the old ones were stale, all 4 retaken

The 4 JPGs left by the interrupted builder showed the **v2 (radar-3)**
dashboard (header "radar-3 model", Steakhouse $47.6M, formula
3.958 + 0.394, "no token" badges, CV x3.33) — wrong for v3 and a
screenshot/code mismatch. All 4 were retaken in Falkon headless
(Xvfb, 1280x1200, `ffmpeg` x11grab) against the current radar-4
dashboard served from `out/`, and visually inspected:

| file | shows | size |
|---|---|---|
| 1-board.jpg | board, ranks 1–5 with FARM badges (Steakhouse $37.2M, USDD $31.8M, Veda $29.0M, Gauntlet $28.7M, Nonce $25.5M), "radar-4 model", TS OOS x2.10, 12 FARM / 82 THIN / 104 SKIP | 160,477 B |
| 2-detail.jpg | Steakhouse detail: $37.2M = TVL $2.75B × 0.013, formula with 11 chains, band $12.9M–$105.4M, $3 gas, verdict FARM, farm steps 1–2 | 110,161 B |
| 3-filtered.jpg | Lending filter, 13 rows (Curvance $16.5M FARM, Tydro $15.3M THIN, …) | 157,980 B |
| 4-method.jpg | Method panel: formula 4.132 + 0.387 − 0.085, validation table (CV x2.94, TS x2.10, RTS x2.11, previous radar x5.41), full bootstrap table incl. Chains c −0.261 / −0.088 / +0.081, backtest section start | 160,671 B |

All 1280x1200 (long side ≤ 1440, short side ≥ 800), each ≤ 512 KiB,
all legible. First attempt at 1280x800 rendered no board rows (the
table header sat at the bottom of the viewport); the taller viewport
fixed it — a Falkon framing issue, not a code bug. `out/` was
regenerated after the retakes so the dossier embeds these 4 images
(sha256s match the inspected files).

## 5. Kit check (fresh kit, newest level)

Kit re-downloaded 2026-11-16 ~13:01 WITA (`curl
https://make.fun/c/token-radar-01/kit`), replacing
`~/workspace/makefun/token-radar-01-kit/`. It is newer than the copy
the v2 work used: `harness_version` a7102f54 → 40f5d27e (node
v22.23.4 → v26.13.1), `scorer_version` efd47cba → b9812df2
(`program@09a3c69e` unchanged), `pricing_rev` 472b48ba → 45c98b74;
`RULES.txt`, `cli/makefun.mjs`, and harness files changed. The
**snapshot is identical** (sha256
`42a71213519479f3a180cc5010cbbf6bd18a2447fa0ad29e4c5122b6c9184393`,
as_of 2026-11-14, 758 protocols, 40 watchlist) — no validation number
moves. The RULES.txt diff (29 lines) is side-market betting, a
`--env-file` → `--dotenv` rename, README-badge wording, and harness
hashes — no change to the entry format, gates, or scoring.

`node cli/makefun.mjs check --repo <v3> --worktree` (fresh kit):
**4 passed, 1 failed, 14 skipped, 5 checked at submission.**
- Pass: `competition_open` (now is between 2026-11-14T10:00Z and
  2026-12-14T10:00Z), `snapshot` (24 files, 2,974,360 bytes, within
  caps), `license_osi` (MIT), `entrypoint` (main.ts, node22).
- Fail: `transcripts_present` — no transcripts were uploaded. This is
  expected at this stage: no bundle was created (bundling is a submit
  step, out of scope for this finish task). It is not a code defect;
  the entry passes everything checkable without transcripts.
- Skipped (14): prerequisites, strategy_note, committed_secret, and
  all transcript-dependent checks (no session to read).
- At submission (5): `repo_public`, `repo_owner`, `repo_created_after_open`,
  `commit_in_repo`, `duplicate_snapshot` — these can only pass once the
  repo is created and pushed, which is the main agent's step after the
  user's confirmation. Note the check names the v2 repo URL
  (`makefun-token-radar-v2`) because this working copy's remote still
  points there; the v3 repo will be new.

## 6. Pre-submit notes for the main agent

- **README badges point at the v2 repo** (`makefun-token-radar-v2`
  in the rank/reward badge URLs). Update them to the v3 repo name when
  it is created. The new RULES.txt is explicit that the README must
  carry the three live badges with no template placeholder in the
  badge URLs.
- `{referral_code}` placeholder remains on README line 62 (the
  "Entered on make.fun" footer link) — cosmetic, same as v2, which
  passed its check.
- A transcripts bundle is needed at submit (`makefun bundle` + the
  standard flags); the check above was run without one.
- `out/` is generated output (not committed, same as v2); a
  `.gitignore` for it was added in this commit.
- Files changed in this commit vs v2 HEAD `a0efbcf`: `lib/model.ts`,
  `main.ts`, `dashboard/app.css`, `dashboard/app.js`,
  `dashboard/index.html`, `screenshots/*.jpg` (4 retakes),
  `V3-REPORT.md` (this file), `.gitignore` (new). v1 and v2 entries
  were not touched.
