# Evening Noodle House

[![make.fun](https://make.fun/badge/best-cooking-game-20261125-0137.svg)](https://make.fun/c/best-cooking-game-20261125-0137)
[![rank](https://make.fun/badge/best-cooking-game-20261125-0137/zaldie/neon-noodle-stall/rank.svg)](https://make.fun/c/best-cooking-game-20261125-0137)
[![reward](https://make.fun/badge/best-cooking-game-20261125-0137/zaldie/neon-noodle-stall/reward.svg)](https://make.fun/c/best-cooking-game-20261125-0137)

An original 3D cooking game built for the make.fun bounty
[Make the best cooking game](https://make.fun/c/best-cooking-game-20261125-0137).
You run a noodle shop at dusk: customers queue up at the counter, your chef
cooks behind it, and you build each dish to order before patience runs out.

## How to play

- **Take orders** — tickets appear on the order board with a patience bar and
  a customer face that sours as the timer drains. Customers wait in line;
  serve the one at the front.
- **Build the bowl** — click the ingredient bins on the counter (or press
  `1`–`6`): Noodle, Egg, Chicken, Chilli, Greens, Tofu. Four recipes to learn:
  Neon Chicken Noodles, Spicy Egg Noodles, Green Tofu Noodles, Noodle Supreme.
- **Cook** — press `C` to fire the wok. Six seconds to cook; leave it past
  nine and it burns. Watch the chef stir.
- **Wok Toss** — while cooking, press `SPACE` when the toss marker hits the
  green zone for a perfect toss: the wok lifts, bonus flavour and a bigger
  combo multiplier.
- **Serve** — plate the dish (`Enter`) and serve it to the matching ticket
  for points, a patience tip and a combo streak (up to x5). Wrong dish,
  burnt dish or expired ticket breaks the combo.
- `T` trash the bowl, `M` mute, `P` pause, `R` restart. A full session
  lasts 90 seconds.

## Tech

Raw WebGL (no libraries) + vanilla JavaScript + a DOM HUD, no network
requests, no external assets. The 3D shop, chef and customers are low-poly
geometry built in code; all sound is synthesized with the WebAudio API. The
simulation is seeded and deterministic: every screenshot under `screenshots/`
is a real render of the game's own code via `?shot=<name>&seed=1` (see
`shots.json`).

## Run it

```sh
node serve.ts   # serves game/ at http://localhost:8080
```

Or open `game/index.html` from any static server. Node 22.18+ required for
the entry program:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Layout

- `game/` — the playable game as static files (`index.html` + `src/`)
- `game/src/` — one job per file: `config`, `random` (seeded RNG),
  `recipes`, `world` (pure rules, no DOM), `input` (3D picking + keys),
  `audio` (synth SFX), `render` (WebGL 3D scene), `hud` (DOM overlay),
  `shots` (deterministic screenshot scenes), `main` (game loop)
- `screenshots/` — 4 real renders of the game
- `main.ts` — the make.fun entry program (copies `game/` + `screenshots/`
  and writes `dossier.json`)
- `vendor/makefun-game.ts` — the kit's library, unchanged

MIT licensed. Original idea, art, sounds and names — no commercial game
was copied.
