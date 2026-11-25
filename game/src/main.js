// main.js — entry point for Evening Noodle House.
// Wires the pure world simulation to the WebGL renderer, the DOM HUD,
// input and synth sound, and runs the fixed-step loop. URL params:
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
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { autopilot, stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || 1) || 1;
const shotName = params.get('shot');
const demo = params.get('demo') === '1';

const canvas = document.getElementById('game');
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;
const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
if (!gl) {
  const err = document.getElementById('gl-error');
  if (err) err.classList.remove('hidden');
  console.error('WebGL is not available in this browser.');
}

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

function blurButtons() {
  if (document.activeElement && document.activeElement.tagName === 'BUTTON') {
    document.activeElement.blur();
  }
}

const actions = {
  start() {
    audio.sfxClick();
    blurButtons();
    startGame(world);
  },
  restart() {
    saveBest();
    audio.sfxClick();
    blurButtons();
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

const renderer = gl ? createRenderer(gl) : null;
const hud = createHud(actions);
const { hover } = attachInput(
  canvas,
  world,
  actions,
  audio,
  renderer ? (x, y) => renderer.pick(x, y) : null,
);

// Screenshot mode: stage the scene once, then keep rendering the same
// frozen frame (fixed animation clock) so the capture is stable.
let shotFx = null;
if (shotName) {
  const staged = stageShot(shotName, world);
  shotFx = staged.fx;
  if (staged.fx) fx.flame = staged.fx.flame;
  world.screen = 'play';
}

let last = performance.now();
let accumulator = 0;
let animTime = 2.0; // frozen clock in shot mode; advances live otherwise

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
      animTime += dt;
    } else if (world.screen === 'title') {
      animTime += dt;
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
  if (renderer) renderer.render(world, hover.id, fx, animTime, shotName ? 0 : dt);
  hud.update(world, fx);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
