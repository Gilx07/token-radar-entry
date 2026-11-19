# token-radar-entry

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Gilx07/token-radar-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Gilx07/token-radar-entry/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it ranks pre-token protocols by an implied value computed
only from a sealed DefiLlama snapshot, and shows how to farm each one. Built by
an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes the ranked
board to `board.json`, the dashboard data to `data.js`, copies `dashboard/` and
`screenshots/` to the output, and writes `dossier.json` with the vendored
`vendor/makefun-board.ts` library.

## The model (radar-2)

`implied = TVL x 0.25 x growth x maturity x chains x category x age`

- **Base**: TVL x 0.25.
- **Growth**: the 7-day TVL change, clamped to -60%..120%, weighted x0.5.
- **Maturity**: 0.6 rising to 1.0 over 1,095 days with no token (unknown age: 365).
- **Chains**: each extra chain adds 2%, up to 5 steps.
- **Category**: launch-heavy categories (Dexs, Lending, Yield, Derivatives, CDP,
  Perpetuals, Stablecoins) score x1.05; wrapper/bridge/staking products x0.92.
- **Age factor**: under 90 days old scores x0.80 (unproven); past 1,460 days with
  no token scores x0.92 (four years with no token suggests it may never come).

The board ranks all 198 rankable pre-token protocols: the 40-protocol watchlist
plus every other rankable protocol below its floor. Wrapped, staked and bridged
products of tokens that already trade are excluded: they are not protocols still
waiting on a launch of their own. Live-token protocols are set aside and shown
at the market's own value. Farm steps are generated from each protocol's own
category, chains, TVL and age, with a cost and a time on every step. No protocol
name is ever special-cased.

## The dashboard

`dashboard/` is a static page with no network: a sortable, filterable board, a
detail view per protocol with a model breakdown and farm plan, a live-token view,
and a model sandbox that re-ranks the board when a constant moves.

---

<sub>Entered on [make.fun](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

## License

MIT. See LICENSE.
