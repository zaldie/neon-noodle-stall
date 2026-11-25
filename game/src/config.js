// config.js — all tunable numbers for Neon Noodle Stall in one place.
// Nothing here touches the DOM or the network; the world simulation reads
// only these constants, so a balance tweak never risks a reference leak.
export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

export const SESSION_SECONDS = 90;
export const MAX_TICKETS = 3;
export const MAX_BOWL_ITEMS = 4;

export const COOK_SECONDS = 6; // done at 6s, burns if left past BURN_SECONDS
export const BURN_SECONDS = 9;

export const PATIENCE_START = 25; // seconds a ticket waits at session start
export const PATIENCE_MIN = 18; // patience floor once the rush ramps up
export const SPAWN_START = 12; // seconds between new tickets at session start
export const SPAWN_MIN = 7; // fastest spawn interval late in a session

export const BASE_POINTS = 100;
export const MAX_TIP = 50;
export const PERFECT_TOSS_BONUS = 25;
export const GOOD_TOSS_BONUS = 10;
export const WRONG_SERVE_PENALTY = 20;
export const MAX_COMBO = 5;

// Wok Toss meter: the marker sweeps 0..1 and back. Green = perfect.
export const TOSS_PERIOD = 1.6; // seconds for one full sweep
export const TOSS_PERFECT_HALF = 0.07; // +/- around the green centre
export const TOSS_GOOD_HALF = 0.16; // +/- around the green centre

// Colours — dark night market, hot neon, bright food.
export const COLORS = {
  background: '#0d0a1a',
  backgroundMid: '#17112e',
  board: '#241a45',
  boardEdge: '#ff2fb3',
  counter: '#2b1d4d',
  counterTop: '#3a2a66',
  wok: '#1c1c22',
  bowl: '#f5f0e6',
  plate: '#fdfdfd',
  neonPink: '#ff2fb3',
  neonCyan: '#22e6ff',
  neonYellow: '#ffd60a',
  neonGreen: '#39ff88',
  neonOrange: '#ff7a18',
  neonRed: '#ff3b30',
  text: '#fff7e6',
  textDim: '#c9b8e8',
  ticket: '#fff3d6',
  ticketInk: '#2a1a3a',
  steam: 'rgba(230, 240, 255, 0.55)',
};
