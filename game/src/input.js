// input.js — mouse + keyboard for Neon Noodle Stall.
// The canvas is scaled to fit the window, so every click is mapped back
// into the 1280x720 game space first. This module knows the clickable
// zones (bins, wok, serve, trash, start) and turns a pointer position into
// a game action; render.js asks it where the pointer is for hover states.
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './config.js';
import { INGREDIENTS } from './recipes.js';

// Layout zones shared with render.js — one source of truth for hit areas.
export const ZONES = {
  bins: INGREDIENTS.map((ing, i) => ({
    id: ing.id,
    x: 40 + i * 200,
    y: 560,
    w: 180,
    h: 120,
  })),
  wok: { x: 470, y: 330, w: 340, h: 150 },
  bowl: { x: 120, y: 330, w: 300, h: 150 },
  plate: { x: 860, y: 330, w: 300, h: 150 },
  serve: { x: 880, y: 500, w: 260, h: 56 },
  trash: { x: 140, y: 500, w: 260, h: 56 },
  start: { x: 490, y: 470, w: 300, h: 70 },
};

export function pointInZone(x, y, zone) {
  return x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h;
}

export function toGameCoords(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    y: ((clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
  };
}

// Attach listeners. `actions` is the set of callbacks main.js wires to the
// world (addIngredient, startCooking, toss, serve, trash, start, togglePause,
// toggleMute, restart). Returns { pointer } for hover rendering.
export function attachInput(canvas, world, actions, audio) {
  const pointer = { x: -1, y: -1, down: false };

  function unlockAudio() {
    if (audio && audio.unlock) audio.unlock();
  }

  canvas.addEventListener('pointermove', (event) => {
    const p = toGameCoords(canvas, event.clientX, event.clientY);
    pointer.x = p.x;
    pointer.y = p.y;
  });

  canvas.addEventListener('pointerdown', (event) => {
    unlockAudio();
    const p = toGameCoords(canvas, event.clientX, event.clientY);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.down = true;
    handleClick(p.x, p.y);
  });

  canvas.addEventListener('pointerup', () => {
    pointer.down = false;
  });

  canvas.addEventListener('pointerleave', () => {
    pointer.x = -1;
    pointer.y = -1;
    pointer.down = false;
  });

  function handleClick(x, y) {
    if (world.screen === 'title') {
      if (pointInZone(x, y, ZONES.start)) actions.start();
      return;
    }
    if (world.screen === 'over') {
      if (pointInZone(x, y, ZONES.start)) actions.restart();
      return;
    }
    if (world.screen === 'pause') {
      actions.togglePause();
      return;
    }
    // Playing: bins first, then wok / plate / serve / trash.
    for (const bin of ZONES.bins) {
      if (pointInZone(x, y, bin)) {
        actions.addIngredient(bin.id);
        return;
      }
    }
    if (pointInZone(x, y, ZONES.wok)) {
      actions.startCooking();
      return;
    }
    if (pointInZone(x, y, ZONES.plate)) {
      // A cooked wok dish plates first; a plated dish serves.
      if (!actions.plateDish()) actions.serve();
      return;
    }
    if (pointInZone(x, y, ZONES.serve)) {
      actions.serve();
      return;
    }
    if (pointInZone(x, y, ZONES.trash)) {
      actions.trash();
    }
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    unlockAudio();
    const key = event.key.toLowerCase();
    if (key === ' ') {
      event.preventDefault();
      if (world.screen === 'play') actions.toss();
      return;
    }
    if (world.screen === 'title' && (key === 'enter' || key === ' ')) {
      actions.start();
      return;
    }
    if (world.screen === 'over' && key === 'r') {
      actions.restart();
      return;
    }
    if (key === 'p') {
      actions.togglePause();
      return;
    }
    if (key === 'm') {
      actions.toggleMute();
      return;
    }
    if (world.screen !== 'play') return;
    const ingredient = INGREDIENTS.find((ing) => ing.key === key);
    if (ingredient) {
      actions.addIngredient(ingredient.id);
      return;
    }
    if (key === 'c') actions.startCooking();
    else if (key === 'enter') {
      if (!actions.plateDish()) actions.serve();
    }
    else if (key === 't') actions.trash();
    else if (key === 'r') actions.restart();
  });

  return { pointer };
}
