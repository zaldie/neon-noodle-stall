// Neon Night-Market Noodle Stall — make.fun entry program (Node 22, stdlib only).
//
// This program hands the game in. It copies the static game (game/) and the
// screenshots (screenshots/) from beside this file into the output directory
// and writes output/dossier.json with the vendored make.fun library, so the
// judge can read the game from the dossier alone.
//
// Run locally the same way the grader runs it:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Outside the grader MAKEFUN_OUTPUT_DIR stands in for /output.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Caps mirror the sealed scorer's limits: at most 4 screenshots, each at most
// 256 KiB; game/ at most 993 files and 48 MiB in all. The dossier text is
// capped at 160 KiB, as the judge's view is built from it.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
