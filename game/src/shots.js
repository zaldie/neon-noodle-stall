// shots.js — deterministic screenshot scenes for Neon Noodle Stall.
// Each scene replays the real rules forward from a fresh seeded world for
// a fixed number of steps, steered by a tiny scripted cook (add the right
// ingredients, cook, toss perfectly, plate). The frame is what a short
// game really looks like, and the same seed always gives the same frame —
// never a mockup. main.js calls stageShot(name, world) when ?shot= is set.
import { STEP, addIngredient, plateDish, serve, spawnTicket, startCooking, startGame, step, toss } from './world.js';
import { RECIPE_BY_ID } from './recipes.js';

function stepSeconds(world, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) step(world, STEP);
}

function cookRecipe(world, recipeId, cookSeconds) {
  const recipe = RECIPE_BY_ID[recipeId];
  for (const id of recipe.ingredients) addIngredient(world, id);
  const started = startCooking(world);
  if (!started.ok) return false;
  stepSeconds(world, cookSeconds);
  // Past the cook time the dish is done in the wok: plate it.
  if (world.wok && world.wok.done) plateDish(world);
  return true;
}

// Force the toss marker onto the green centre, then toss: a perfect toss
// on demand, still through the real toss() rules.
function perfectToss(world) {
  world.toss.pos = world.toss.greenCentre;
  return toss(world);
}

function fillBoard(world) {
  while (world.tickets.length < 3) spawnTicket(world);
}

// Wide cover: 3 tickets, wok mid-cook with steam, one plated dish ready,
// full HUD — all six required elements in one frame. Staged by playing
// the real rules: serve dish one (score > 0), plate dish two, cook dish
// three halfway with a perfect toss.
function stageWide(world) {
  startGame(world);
  fillBoard(world);
  const first = world.tickets[0].recipeId;
  const second = world.tickets[1].recipeId;
  const third = world.tickets[2].recipeId;
  cookRecipe(world, first, 6.5); // finishes cooking -> plated
  serve(world); // real serve: score > 0, served 1
  fillBoard(world);
  cookRecipe(world, second, 6.5); // finishes cooking -> plated, ready to serve
  // Third dish mid-cook in the wok with steam + a perfect toss,
  // while the second dish waits on the plate.
  const thirdRecipe = RECIPE_BY_ID[third];
  for (const id of thirdRecipe.ingredients) addIngredient(world, id);
  startCooking(world);
  stepSeconds(world, 3.0);
  perfectToss(world);
  return { screen: 'play', fx: { flame: 0.6 } };
}

// Close-up: a full bowl, bins ticked, ready to cook.
function stageIngredients(world) {
  startGame(world);
  fillBoard(world);
  const recipe = RECIPE_BY_ID[world.tickets[0].recipeId];
  for (const id of recipe.ingredients) addIngredient(world, id);
  stepSeconds(world, 2.0);
  return { screen: 'play', fx: { flame: 0 } };
}

// Mid-assembly: wok cooking, toss meter live, steam, cook timer prominent.
function stageAssembly(world) {
  startGame(world);
  fillBoard(world);
  cookRecipe(world, world.tickets[0].recipeId, 4.0);
  perfectToss(world);
  stepSeconds(world, 0.4);
  return { screen: 'play', fx: { flame: 1 } };
}

// Serve: two dishes really served (score, served count and combo all
// earned through the real serve rules), third dish plated and ready.
function stageServe(world) {
  startGame(world);
  fillBoard(world);
  const first = world.tickets[0].recipeId;
  const second = world.tickets[1].recipeId;
  const third = world.tickets[2].recipeId;
  cookRecipe(world, first, 6.5); // plated
  serve(world); // served 1
  fillBoard(world);
  cookRecipe(world, second, 6.5); // plated
  serve(world); // served 2, combo grows
  fillBoard(world);
  cookRecipe(world, third, 6.5); // plated and ready
  stepSeconds(world, 0.5);
  return { screen: 'play', fx: { flame: 0 } };
}

// Set `world` to the named scene and return the screen to draw plus any
// render effect (flame burst). Unknown names fall back to the wide shot.
export function stageShot(name, world) {
  if (name === 'ingredients') return stageIngredients(world);
  if (name === 'assembly') return stageAssembly(world);
  if (name === 'serve') return stageServe(world);
  return stageWide(world);
}

// Demo autopilot for ?demo=1: plays the real game well, one action per tick.
export function autopilot(world) {
  if (world.screen !== 'play') return;
  if (world.plate) {
    serve(world);
    return;
  }
  if (world.wok) {
    if (world.wok.done) {
      plateDish(world);
      return;
    }
    if (!world.wok.burnt && Math.abs(world.toss.pos - world.toss.greenCentre) < 0.05) {
      toss(world);
    }
    return;
  }
  if (world.tickets.length === 0) return;
  const recipe = RECIPE_BY_ID[world.tickets[0].recipeId];
  const next = recipe.ingredients.find((id) => !world.bowl.includes(id));
  if (next) {
    addIngredient(world, next);
    return;
  }
  startCooking(world);
}
