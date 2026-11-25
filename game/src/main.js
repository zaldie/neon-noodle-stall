// main.js — entry point for Neon Noodle Stall.
// Wires the pure world simulation to canvas rendering, input and synth
// sound, and runs the fixed-step loop. URL params:
//   ?shot=wide|ingredients|assembly|serve&seed=N — one deterministic frame
//   ?demo=1 — the autopilot plays the game by itself
//   ?seed=N — the world's seed (default 1)
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './config.js';
import {
  STEP,
  addIngredient,
  createWorld,
  plateDish,
  serve,
  startCooking,
  startGame,
  step,
  toss,
  trash,
} from './world.js';
import { attachInput } from './input.js';
import * as audio from './audio.js';
import { render } from './render.js';
import { autopilot, stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || 1) || 1;
const shotName = params.get('shot');
const demo = params.get('demo') === '1';

const canvas = document.getElementById('game');
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;
const ctx = canvas.getContext('2d');

const world = createWorld(seed);
try {
  const best = Number(window.localStorage.getItem('neon-noodle-best') || 0);
  if (Number.isFinite(best)) world.best = best;
} catch (error) {
  world.best = 0;
}

const fx = { flame: 0 };
let wasCooking = false;
let lastTicketCount = 0;

function saveBest() {
  try {
    if (world.score > world.best) {
      world.best = world.score;
      window.localStorage.setItem('neon-noodle-best', String(world.best));
    }
  } catch (error) {
    // Best score is a nicety; the game plays on without it.
  }
}

const actions = {
  start() {
    audio.sfxClick();
    startGame(world);
  },
  restart() {
    saveBest();
    audio.sfxClick();
    startGame(world);
  },
  addIngredient(id) {
    if (addIngredient(world, id)) audio.sfxAdd();
    else audio.sfxError();
  },
  startCooking() {
    const result = startCooking(world);
    if (result.ok) {
      audio.sfxClick();
      audio.startSizzle();
    } else if (result.reason === 'no-recipe') {
      audio.sfxError();
    }
  },
  plateDish() {
    if (plateDish(world)) {
      audio.sfxClick();
      audio.stopSizzle();
      return true;
    }
    return false;
  },
  toss() {
    const result = toss(world);
    if (result.result === 'perfect') {
      fx.flame = 1;
      audio.sfxTossPerfect();
    } else if (result.result === 'good') {
      audio.sfxTossGood();
    } else if (result.result === 'miss') {
      audio.sfxTossMiss();
    }
  },
  serve() {
    const before = world.score;
    const result = serve(world);
    if (result.ok) {
      audio.sfxServe();
      if (world.score > before) saveBest();
    } else if (result.reason === 'no-order') {
      audio.sfxError();
    }
  },
  trash() {
    if (trash(world)) audio.sfxClick();
  },
  togglePause() {
    if (world.screen === 'play') {
      world.screen = 'pause';
      audio.stopSizzle();
    } else if (world.screen === 'pause') {
      world.screen = 'play';
    }
  },
  toggleMute() {
    audio.toggleMute();
  },
};

const { pointer } = attachInput(canvas, world, actions, audio);

// Screenshot mode: stage the scene once, then keep rendering the same
// frozen frame so the capture is stable.
let shotFx = null;
if (shotName) {
  const staged = stageShot(shotName, world);
  shotFx = staged.fx;
  if (staged.fx) fx.flame = staged.fx.flame;
  world.screen = 'play';
}

let last = performance.now();
let accumulator = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!shotName) {
    if (world.screen === 'play') {
      accumulator += dt;
      while (accumulator >= STEP) {
        if (demo) autopilot(world);
        step(world, STEP);
        accumulator -= STEP;
      }
    }
    // Sound follows state: sizzle while the wok cooks, ticket chime on
    // every new arrival, burnt buzz once.
    if (world.wok && !world.wok.burnt && !wasCooking) audio.startSizzle();
    if (!world.wok && wasCooking) audio.stopSizzle();
    if (world.wok && world.wok.burnt && !wasCooking) audio.sfxBurnt();
    wasCooking = !!world.wok;
    if (world.tickets.length > lastTicketCount) audio.sfxTicket();
    lastTicketCount = world.tickets.length;
    if (world.screen === 'over') saveBest();
    fx.flame = Math.max(0, fx.flame - dt * 1.4);
  }
  render(ctx, world, pointer, fx);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
