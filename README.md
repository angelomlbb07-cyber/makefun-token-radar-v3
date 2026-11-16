[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/angelomlbb07-cyber/makefun-token-radar-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/angelomlbb07-cyber/makefun-token-radar-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Launch Radar — radar-3

A token launch radar that prices pre-token protocols with a **fitted size
curve**, computed live from the snapshot's own launched protocols, and shows
a concrete, costed farm plan for each one, in a sortable, filterable static
dashboard.

## The model

```
log10(implied value) = a + b x log10(TVL)
```

with `a` and `b` fit by ordinary least squares on the 92 clean comps — the
snapshot's launched protocols that pass the same cleanliness rule as the
watchlist. No protocol name is special-cased and no coefficient is
hardcoded: the program re-derives the fit from the snapshot on every run.

Validation, computed on the same snapshot at runtime:

- 5-fold cross-validation (seeded): median factor error about x3.3, about
  38% of comps within 2x of their realised market cap.
- Time split (train on the older half by listing date, test on the newer
  half): median factor error about x2.1, about 46% within 2x.
- The previous radar's linear 0.18 x TVL rule measured x5.41 on the same
  time split. Growth and age terms were tried and dropped: they do not beat
  the pure size curve on both validations, and their coefficients flip sign
  between fits.

Real token values scale as TVL^0.39, not TVL^1.0, so a linear rule
overstates large protocols enormously — for the top protocol here the
linear rule claims about 14x what the fitted curve claims. The ranking
barely moves; the win is calibration and credibility, not a new ranking.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

`main.ts` (Node 22, stdlib only) reads the snapshot, fits the curve,
validates it, writes `/output/board.json` (198 rows: the 40 watchlist
protocols plus the 158 highest-implied pre-token protocols below the floor),
writes the dashboard's data, copies the dashboard and screenshots, writes
the research note from the validation this run computed, and writes
`/output/dossier.json` with the kit's `buildDossier`. Two runs produce
byte-identical output.

## Farm plans

Each plan is built from the protocol's own mechanism (lending, DEX,
perpetuals, yield, RWA, curator, staking, bridge, stablecoin, prediction,
insurance, or its own app) on its own main chain, with a cost and a time
per step and a netted verdict: total gas against the position it earns.
Gas figures are typical mainnet costs per chain, labelled as estimates.
No step is copied across rows.

<sub>Entered on [make.fun](https://make.fun/?ref={referral_code}&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
