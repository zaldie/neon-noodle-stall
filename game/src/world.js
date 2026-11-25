// world.js — pure game state and rules for Neon Noodle Stall.
// No DOM, no canvas, no Math.random, no Date: the same seed and the same
// inputs always produce the same state, which is what makes the screenshot
// scenes reproducible. The browser layers (input/render/audio) call these
// functions; Node can import this file directly for tests.
//
// State shape:
//   screen: 'title' | 'play' | 'pause' | 'over'
//   timeLeft, elapsed, score, served, bestCombo, combo
//   bowl: ingredient ids being assembled (max 4)
//   wok: null | { recipe, cookTime, tossed, tossScore, perfect, phase }
//   plate: null | { recipe, ready } — a cooked dish waiting to be served
//   tickets: [{ id, recipeId, patience, patienceMax, face }]
//   toss: { pos, dir, greenCentre } — the Wok Toss meter while cooking
//   events: short-lived popups the renderer shows [{ text, kind, ttl }]
//   stats: { perfectTosses, burnt, wrongServes, expired }
import {
  BURN_SECONDS,
  COOK_SECONDS,
  GOOD_TOSS_BONUS,
  MAX_BOWL_ITEMS,
  MAX_COMBO,
  MAX_TICKETS,
  PATIENCE_MIN,
  PATIENCE_START,
  PERFECT_TOSS_BONUS,
  SESSION_SECONDS,
  SPAWN_MIN,
  SPAWN_START,
  TOSS_GOOD_HALF,
  TOSS_PERFECT_HALF,
  TOSS_PERIOD,
  WRONG_SERVE_PENALTY,
} from './config.js';
import { makeRng } from './random.js';
import { matchRecipe, RECIPES } from './recipes.js';

export const STEP = 1 / 60;

let nextTicketId = 1;

export function createWorld(seed = 1) {
  nextTicketId = 1;
  return {
    seed,
    rng: makeRng(seed),
    screen: 'title',
    timeLeft: SESSION_SECONDS,
    elapsed: 0,
    score: 0,
    served: 0,
    combo: 0,
    bestCombo: 0,
    bowl: [],
    wok: null,
    plate: null,
    tickets: [],
    spawnIn: 2.5,
    toss: { pos: 0, dir: 1, greenCentre: 0.5 },
    lastTossScore: 0,
    events: [],
    stats: { perfectTosses: 0, goodTosses: 0, burnt: 0, wrongServes: 0, expired: 0 },
    best: 0,
  };
}

function pushEvent(world, text, kind) {
  world.events.push({ text, kind: kind || 'info', ttl: 1.6 });
  if (world.events.length > 5) world.events.shift();
}

function patienceFor(world) {
  const ramp = world.elapsed / SESSION_SECONDS;
  return Math.max(PATIENCE_MIN, PATIENCE_START - ramp * (PATIENCE_START - PATIENCE_MIN));
}

function spawnIntervalFor(world) {
  const ramp = world.elapsed / SESSION_SECONDS;
  return Math.max(SPAWN_MIN, SPAWN_START - ramp * (SPAWN_START - SPAWN_MIN));
}

export function spawnTicket(world) {
  if (world.tickets.length >= MAX_TICKETS) return null;
  const recipe = world.rng.pick(RECIPES);
  const patience = patienceFor(world);
  const ticket = {
    id: nextTicketId,
    recipeId: recipe.id,
    patience,
    patienceMax: patience,
    face: 'happy',
  };
  nextTicketId += 1;
  world.tickets.push(ticket);
  return ticket;
}

function faceFor(ticket) {
  const ratio = ticket.patience / ticket.patienceMax;
  if (ratio > 0.55) return 'happy';
  if (ratio > 0.25) return 'worried';
  return 'angry';
}

export function startGame(world) {
  world.screen = 'play';
  world.timeLeft = SESSION_SECONDS;
  world.elapsed = 0;
  world.score = 0;
  world.served = 0;
  world.combo = 0;
  world.bestCombo = 0;
  world.bowl = [];
  world.wok = null;
  world.plate = null;
  world.tickets = [];
  world.spawnIn = 1.2;
  world.lastTossScore = 0;
  world.events = [];
  world.stats = { perfectTosses: 0, goodTosses: 0, burnt: 0, wrongServes: 0, expired: 0 };
  spawnTicket(world);
}

// Add one ingredient to the bowl. Returns false when the bowl is full.
export function addIngredient(world, ingredientId) {
  if (world.screen !== 'play') return false;
  if (world.bowl.length >= MAX_BOWL_ITEMS) return false;
  if (world.wok) return false; // busy cooking: finish the wok first
  world.bowl.push(ingredientId);
  return true;
}

// Move the bowl into the wok and start cooking. Needs a full recipe match.
export function startCooking(world) {
  if (world.screen !== 'play') return { ok: false, reason: 'not-playing' };
  if (world.wok) return { ok: false, reason: 'busy' };
  if (world.bowl.length === 0) return { ok: false, reason: 'empty' };
  const recipe = matchRecipe(world.bowl);
  if (!recipe) return { ok: false, reason: 'no-recipe' };
  world.wok = {
    recipe,
    cookTime: 0,
    done: false,
    tossed: 0,
    tossScore: 0,
    perfect: false,
    burnt: false,
  };
  world.bowl = [];
  world.toss = {
    pos: 0,
    dir: 1,
    greenCentre: 0.3 + world.rng.next() * 0.4,
  };
  return { ok: true, recipe };
}

// One Wok Toss attempt. Call while cooking; the meter position decides it.
export function toss(world) {
  if (world.screen !== 'play' || !world.wok || world.wok.burnt) {
    return { result: 'none' };
  }
  const { pos, greenCentre } = world.toss;
  const distance = Math.abs(pos - greenCentre);
  let result = 'miss';
  let bonus = 0;
  if (distance <= TOSS_PERFECT_HALF) {
    result = 'perfect';
    bonus = PERFECT_TOSS_BONUS;
    world.stats.perfectTosses += 1;
    world.wok.perfect = true;
  } else if (distance <= TOSS_GOOD_HALF) {
    result = 'good';
    bonus = GOOD_TOSS_BONUS;
    world.stats.goodTosses += 1;
  }
  world.wok.tossed += 1;
  world.wok.tossScore += bonus;
  // The green zone jumps somewhere new after every toss.
  world.toss.greenCentre = 0.25 + world.rng.next() * 0.5;
  return { result, bonus };
}

// Serve the plated dish. Returns what happened so the UI can react.
export function serve(world) {
  if (world.screen !== 'play') return { ok: false, reason: 'not-playing' };
  if (!world.plate) return { ok: false, reason: 'no-plate' };
  const recipe = world.plate.recipe;
  const index = world.tickets.findIndex((t) => t.recipeId === recipe.id);
  world.plate = null;
  if (index === -1) {
    world.combo = 0;
    world.stats.wrongServes += 1;
    world.score = Math.max(0, world.score - WRONG_SERVE_PENALTY);
    pushEvent(world, `No order for ${recipe.name}! -${WRONG_SERVE_PENALTY}`, 'bad');
    return { ok: false, reason: 'no-order', recipe };
  }
  const ticket = world.tickets[index];
  world.tickets.splice(index, 1);
  const tip = Math.round((ticket.patience / ticket.patienceMax) * 50);
  world.combo = Math.min(MAX_COMBO, world.combo + 1);
  world.bestCombo = Math.max(world.bestCombo, world.combo);
  const points = (recipe.basePoints + tip + world.lastTossScore) * world.combo;
  world.lastTossScore = 0;
  world.score += points;
  world.served += 1;
  pushEvent(world, `${recipe.name} +${points}`, 'good');
  return { ok: true, recipe, points, tip, combo: world.combo };
}

// Throw the bowl (or a burnt wok) away.
export function trash(world) {
  if (world.screen !== 'play') return false;
  if (world.bowl.length === 0 && !world.wok) return false;
  if (world.wok && world.wok.burnt) world.stats.burnt += 1;
  world.bowl = [];
  world.wok = null;
  world.lastTossScore = 0;
  return true;
}

function finishCooking(world) {
  const wok = world.wok;
  world.plate = { recipe: wok.recipe, ready: true };
  world.lastTossScore = wok.tossScore;
  world.wok = null;
  pushEvent(world, `${wok.recipe.name} ready — serve it!`, 'info');
}

// Move a cooked wok dish onto the plate. Only a done, unburnt wok plates.
export function plateDish(world) {
  if (world.screen !== 'play') return false;
  if (!world.wok || !world.wok.done || world.wok.burnt) return false;
  if (world.plate) return false;
  finishCooking(world);
  return true;
}

// Advance the simulation by dt seconds. Pure: same inputs, same outcome.
export function step(world, dt) {
  if (world.screen !== 'play') return;
  world.elapsed += dt;
  world.timeLeft -= dt;
  if (world.timeLeft <= 0) {
    world.timeLeft = 0;
    world.screen = 'over';
    world.best = Math.max(world.best, world.score);
    return;
  }

  // Ticket spawner.
  world.spawnIn -= dt;
  if (world.spawnIn <= 0) {
    spawnTicket(world);
    world.spawnIn = spawnIntervalFor(world);
  }

  // Patience drains; an expired ticket leaves angry and breaks the combo.
  for (let i = world.tickets.length - 1; i >= 0; i -= 1) {
    const ticket = world.tickets[i];
    ticket.patience -= dt;
    ticket.face = faceFor(ticket);
    if (ticket.patience <= 0) {
      world.tickets.splice(i, 1);
      world.stats.expired += 1;
      world.combo = 0;
      pushEvent(world, 'A customer walked away!', 'bad');
    }
  }

  // Wok: cook timer, toss meter sweep, done flag, burn.
  if (world.wok) {
    world.wok.cookTime += dt;
    world.toss.pos += world.toss.dir * (dt / TOSS_PERIOD) * 2;
    if (world.toss.pos >= 1) {
      world.toss.pos = 1;
      world.toss.dir = -1;
    } else if (world.toss.pos <= 0) {
      world.toss.pos = 0;
      world.toss.dir = 1;
    }
    // Done at 6s — but it stays in the wok until plated, and burns at 9s.
    if (!world.wok.done && world.wok.cookTime >= COOK_SECONDS) {
      world.wok.done = true;
      pushEvent(world, `${world.wok.recipe.name} cooked — plate it!`, 'info');
    }
    if (!world.wok.burnt && world.wok.cookTime >= BURN_SECONDS) {
      world.wok.burnt = true;
      world.combo = 0;
      pushEvent(world, 'Burnt! Trash it (T)', 'bad');
    }
  } else if (world.plate === null) {
    world.lastTossScore = 0;
  }

  // Event popups fade.
  for (let i = world.events.length - 1; i >= 0; i -= 1) {
    world.events[i].ttl -= dt;
    if (world.events[i].ttl <= 0) world.events.splice(i, 1);
  }
}

// Deterministic snapshot for tests: same seed + same inputs -> same text.
export function snapshot(world) {
  return JSON.stringify({
    score: world.score,
    served: world.served,
    combo: world.combo,
    timeLeft: Math.round(world.timeLeft * 100) / 100,
    bowl: world.bowl,
    wok: world.wok
      ? { recipe: world.wok.recipe.id, cook: Math.round(world.wok.cookTime * 100) / 100 }
      : null,
    plate: world.plate ? world.plate.recipe.id : null,
    tickets: world.tickets.map((t) => ({
      recipe: t.recipeId,
      patience: Math.round(t.patience * 100) / 100,
    })),
    stats: world.stats,
  });
}
