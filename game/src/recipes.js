// recipes.js — the ingredients on the counter and the four noodle dishes.
// Names, colours and icons are original to this stall; nothing here copies
// another cooking game. render.js draws each ingredient's icon by `icon`.
export const INGREDIENTS = [
  { id: 'noodle', name: 'Noodle', short: 'MIE', key: '1', color: '#ffd60a', icon: 'noodle' },
  { id: 'egg', name: 'Egg', short: 'EGG', key: '2', color: '#fff3b0', icon: 'egg' },
  { id: 'chicken', name: 'Chicken', short: 'AYAM', key: '3', color: '#ff9f5a', icon: 'chicken' },
  { id: 'chilli', name: 'Chilli', short: 'CABE', key: '4', color: '#ff3b30', icon: 'chilli' },
  { id: 'greens', name: 'Greens', short: 'SAYUR', key: '5', color: '#39ff88', icon: 'greens' },
  { id: 'tofu', name: 'Tofu', short: 'TAHU', key: '6', color: '#f5f0e6', icon: 'tofu' },
];

export const INGREDIENT_BY_ID = Object.fromEntries(
  INGREDIENTS.map((item) => [item.id, item]),
);

export const RECIPES = [
  {
    id: 'ayam',
    name: 'Mie Ayam Neon',
    ingredients: ['noodle', 'chicken', 'greens'],
    basePoints: 100,
  },
  {
    id: 'telur',
    name: 'Mie Telor Pedas',
    ingredients: ['noodle', 'egg', 'chilli'],
    basePoints: 100,
  },
  {
    id: 'tahu',
    name: 'Mie Tahu Hijau',
    ingredients: ['noodle', 'tofu', 'greens'],
    basePoints: 100,
  },
  {
    id: 'komplit',
    name: 'Mie Komplit',
    ingredients: ['noodle', 'chicken', 'egg', 'chilli'],
    basePoints: 120,
  },
];

export const RECIPE_BY_ID = Object.fromEntries(
  RECIPES.map((recipe) => [recipe.id, recipe]),
);

// Two ingredient lists match when they hold the same ids, order ignored.
export function sameIngredients(a, b) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((id, index) => id === sortedB[index]);
}

// The recipe a bowl's contents make, or null when it matches nothing.
export function matchRecipe(bowl) {
  for (const recipe of RECIPES) {
    if (sameIngredients(bowl, recipe.ingredients)) return recipe;
  }
  return null;
}
