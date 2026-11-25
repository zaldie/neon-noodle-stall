// input.js — mouse + keyboard for Evening Noodle House.
// The canvas is scaled to fit the window, so every pointer position is
// mapped back into the 1280x720 game space first, then turned into a ray
// by render.js's pick(): the ray hits the ingredient bowls on the counter,
// the wok or the serving plate. DOM buttons (bins, COOK/TOSS/SERVE/TRASH)
// are wired by hud.js; this module owns the 3D canvas and the keyboard.
// Keys: 1-6 ingredients, C cook, SPACE toss, Enter plate/serve, T trash,
// M mute, P pause, R restart.
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './config.js';
import { INGREDIENTS } from './recipes.js';

export function toGameCoords(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    y: ((clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
  };
}

// Attach listeners. `pick` is render.js's raycast: (ndcX, ndcY) -> an
// ingredient id, 'wok', 'plate', or null. Returns { pointer, hover } so
// main.js can highlight what the mouse is over.
export function attachInput(canvas, world, actions, audio, pick) {
  const pointer = { x: -1, y: -1, down: false };
  const hover = { id: null };

  function unlockAudio() {
    if (audio && audio.unlock) audio.unlock();
  }

  function ndc(p) {
    return {
      x: (p.x / CANVAS_WIDTH) * 2 - 1,
      y: 1 - (p.y / CANVAS_HEIGHT) * 2,
    };
  }

  canvas.addEventListener('pointermove', (event) => {
    const p = toGameCoords(canvas, event.clientX, event.clientY);
    pointer.x = p.x;
    pointer.y = p.y;
    const n = ndc(p);
    hover.id = pick ? pick(n.x, n.y) : null;
  });

  canvas.addEventListener('pointerdown', (event) => {
    unlockAudio();
    const p = toGameCoords(canvas, event.clientX, event.clientY);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.down = true;
    if (world.screen !== 'play') return;
    const n = ndc(p);
    const id = pick ? pick(n.x, n.y) : null;
    if (!id) return;
    if (id === 'wok') {
      actions.startCooking();
    } else if (id === 'plate') {
      // A cooked wok dish plates first; a plated dish serves.
      if (!actions.plateDish()) actions.serve();
    } else {
      actions.addIngredient(id);
    }
  });

  canvas.addEventListener('pointerup', () => {
    pointer.down = false;
  });

  canvas.addEventListener('pointerleave', () => {
    pointer.x = -1;
    pointer.y = -1;
    pointer.down = false;
    hover.id = null;
  });

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    unlockAudio();
    // A focused button would also fire on Space/Enter — buttons are for
    // the mouse only, so take focus away first.
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') {
      document.activeElement.blur();
    }
    const key = event.key.toLowerCase();
    if (key === ' ') {
      event.preventDefault();
      if (world.screen === 'play') actions.toss();
      return;
    }
    if (key === 'enter') {
      event.preventDefault();
      if (world.screen === 'title') {
        actions.start();
        return;
      }
      if (world.screen === 'play') {
        if (!actions.plateDish()) actions.serve();
        return;
      }
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
    else if (key === 't') actions.trash();
    else if (key === 'r') actions.restart();
  });

  return { pointer, hover };
}
