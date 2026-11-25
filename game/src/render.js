// render.js — every pixel of Neon Noodle Stall, drawn in canvas code.
// No images, no fonts from the network: shapes, gradients and system
// fonts only. Layout zones match input.js ZONES so clicks land where the
// player sees the control. Text is kept big: ticket names >= 20px, the
// session timer >= 34px, so the screenshots stay legible when shrunk.
import { BURN_SECONDS, CANVAS_HEIGHT, CANVAS_WIDTH, COLORS, COOK_SECONDS, TOSS_GOOD_HALF, TOSS_PERFECT_HALF } from './config.js';
import { INGREDIENTS, INGREDIENT_BY_ID, RECIPE_BY_ID, matchRecipe } from './recipes.js';
import { ZONES, pointInZone } from './input.js';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function neonText(ctx, text, x, y, size, color, align) {
  ctx.save();
  ctx.font = `bold ${size}px "Trebuchet MS", Verdana, sans-serif`;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function plainText(ctx, text, x, y, size, color, align, bold) {
  ctx.save();
  ctx.font = `${bold ? 'bold ' : ''}${size}px "Trebuchet MS", Verdana, sans-serif`;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ---- ingredient icons (drawn, not loaded) ---------------------------------
export function drawIngredientIcon(ctx, icon, cx, cy, size) {
  const s = size;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineWidth = Math.max(2, s * 0.08);
  ctx.lineCap = 'round';
  if (icon === 'noodle') {
    ctx.strokeStyle = '#ffd60a';
    for (let i = -1; i <= 1; i += 1) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, i * s * 0.22);
      ctx.bezierCurveTo(-s * 0.25, i * s * 0.22 - s * 0.18, s * 0.25, i * s * 0.22 + s * 0.18, s * 0.5, i * s * 0.22);
      ctx.stroke();
    }
  } else if (icon === 'egg') {
    ctx.fillStyle = '#fff8e6';
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.52, s * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffb703';
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2);
    ctx.fill();
  } else if (icon === 'chicken') {
    ctx.strokeStyle = '#ff9f5a';
    ctx.lineWidth = s * 0.28;
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, s * 0.25);
    ctx.lineTo(s * 0.25, -s * 0.25);
    ctx.stroke();
    ctx.fillStyle = '#e07b39';
    ctx.beginPath();
    ctx.arc(s * 0.28, -s * 0.28, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f5f0e6';
    ctx.beginPath();
    ctx.arc(-s * 0.38, s * 0.32, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
  } else if (icon === 'chilli') {
    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = s * 0.26;
    ctx.beginPath();
    ctx.moveTo(-s * 0.4, -s * 0.3);
    ctx.quadraticCurveTo(s * 0.1, s * 0.45, s * 0.45, s * 0.05);
    ctx.stroke();
    ctx.strokeStyle = '#39ff88';
    ctx.lineWidth = s * 0.1;
    ctx.beginPath();
    ctx.moveTo(-s * 0.4, -s * 0.3);
    ctx.lineTo(-s * 0.5, -s * 0.48);
    ctx.stroke();
  } else if (icon === 'greens') {
    ctx.fillStyle = '#39ff88';
    for (const [dx, dy, rot] of [[-0.2, 0.1, -0.5], [0.2, 0.05, 0.5], [0, -0.22, 0]]) {
      ctx.save();
      ctx.translate(dx * s, dy * s);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.16, s * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else if (icon === 'tofu') {
    ctx.fillStyle = '#f5f0e6';
    ctx.strokeStyle = '#d8cfc0';
    ctx.lineWidth = 2;
    ctx.fillRect(-s * 0.32, -s * 0.28, s * 0.64, s * 0.56);
    ctx.strokeRect(-s * 0.32, -s * 0.28, s * 0.64, s * 0.56);
    ctx.beginPath();
    ctx.moveTo(-s * 0.32, -s * 0.28);
    ctx.lineTo(-s * 0.12, -s * 0.48);
    ctx.lineTo(s * 0.52, -s * 0.48);
    ctx.lineTo(s * 0.32, -s * 0.28);
    ctx.closePath();
    ctx.fillStyle = '#fffdf5';
    ctx.fill();
  }
  ctx.restore();
}

function drawFace(ctx, mood, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = mood === 'angry' ? '#ffb3a7' : mood === 'worried' ? '#ffe9a8' : '#ffd9b3';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#7a5a3a';
  ctx.stroke();
  // Eyes.
  ctx.fillStyle = '#2a1a3a';
  const eyeY = cy - r * 0.15;
  if (mood === 'angry') {
    ctx.strokeStyle = '#2a1a3a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.55, eyeY - r * 0.25);
    ctx.lineTo(cx - r * 0.15, eyeY);
    ctx.moveTo(cx + r * 0.55, eyeY - r * 0.25);
    ctx.lineTo(cx + r * 0.15, eyeY);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, eyeY, r * 0.11, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.35, eyeY, r * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mouth.
  ctx.strokeStyle = '#2a1a3a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (mood === 'happy') {
    ctx.arc(cx, cy + r * 0.15, r * 0.45, 0.15 * Math.PI, 0.85 * Math.PI);
  } else if (mood === 'worried') {
    ctx.arc(cx, cy + r * 0.65, r * 0.3, 1.15 * Math.PI, 1.85 * Math.PI);
  } else {
    ctx.moveTo(cx - r * 0.4, cy + r * 0.55);
    ctx.lineTo(cx + r * 0.4, cy + r * 0.55);
  }
  ctx.stroke();
  ctx.restore();
}

function drawNoodlePile(ctx, cx, cy, w, ingredients) {
  // A bowl/wok/plate of noodles: yellow swirls plus coloured topping dots.
  ctx.save();
  ctx.strokeStyle = '#ffd60a';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i += 1) {
    const y = cy - 8 + i * 7;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.32, y);
    ctx.bezierCurveTo(cx - w * 0.15, y - 6, cx + w * 0.1, y + 6, cx + w * 0.32, y);
    ctx.stroke();
  }
  (ingredients || []).forEach((id, i) => {
    const ing = INGREDIENT_BY_ID[id];
    if (!ing) return;
    const x = cx - w * 0.22 + i * (w * 0.44) / Math.max(1, ingredients.length - 1 || 1);
    ctx.fillStyle = ing.color;
    ctx.beginPath();
    ctx.arc(x, cy - 16, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.stroke();
  });
  ctx.restore();
}

// ---- background ------------------------------------------------------------
function drawBackground(ctx, world) {
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  grad.addColorStop(0, COLORS.background);
  grad.addColorStop(0.55, COLORS.backgroundMid);
  grad.addColorStop(1, '#120e24');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Distant stall silhouettes + string lights.
  ctx.save();
  ctx.fillStyle = '#1a1338';
  for (let i = 0; i < 6; i += 1) {
    const x = i * 220 + 30;
    ctx.fillRect(x, 96, 150, 60);
    ctx.beginPath();
    ctx.moveTo(x - 8, 96);
    ctx.lineTo(x + 75, 62);
    ctx.lineTo(x + 158, 96);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? '#241a45' : '#1a1338';
    ctx.fill();
    ctx.fillStyle = '#1a1338';
  }
  // String lights.
  ctx.strokeStyle = 'rgba(255, 214, 10, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 40);
  ctx.quadraticCurveTo(CANVAS_WIDTH / 2, 78, CANVAS_WIDTH, 36);
  ctx.stroke();
  const bulbColors = [COLORS.neonPink, COLORS.neonCyan, COLORS.neonYellow, COLORS.neonGreen];
  for (let i = 0; i < 16; i += 1) {
    const t = i / 15;
    const x = t * CANVAS_WIDTH;
    const y = 40 + Math.sin(t * Math.PI) * 30;
    const twinkle = 0.6 + 0.4 * Math.sin(world.elapsed * 2 + i * 1.7);
    ctx.save();
    ctx.globalAlpha = twinkle;
    ctx.fillStyle = bulbColors[i % bulbColors.length];
    ctx.shadowColor = bulbColors[i % bulbColors.length];
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // Neon sign.
  neonText(ctx, 'NEON NOODLE STALL', 40, 26, 30, COLORS.neonPink);
  plainText(ctx, 'pasar malam  •  wok toss  •  SPACE = toss', 40, 52, 14, COLORS.textDim);
}

// ---- order board -----------------------------------------------------------
function drawOrderBoard(ctx, world) {
  ctx.save();
  roundRect(ctx, 30, 66, 1220, 118, 14);
  ctx.fillStyle = COLORS.board;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.boardEdge;
  ctx.shadowColor = COLORS.boardEdge;
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0;
  plainText(ctx, 'ORDER BOARD', 52, 88, 16, COLORS.neonCyan, 'left', true);

  for (let i = 0; i < 3; i += 1) {
    const x = 52 + i * 400;
    const y = 98;
    const w = 372;
    const h = 74;
    const ticket = world.tickets[i];
    roundRect(ctx, x, y, w, h, 10);
    ctx.fillStyle = ticket ? COLORS.ticket : 'rgba(255,243,214,0.12)';
    ctx.fill();
    if (!ticket) {
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,243,214,0.4)';
      ctx.stroke();
      ctx.setLineDash([]);
      plainText(ctx, 'waiting for a customer…', x + w / 2, y + h / 2, 16, COLORS.textDim, 'center');
      continue;
    }
    const recipe = RECIPE_BY_ID[ticket.recipeId];
    drawFace(ctx, ticket.face, x + 34, y + h / 2, 24);
    plainText(ctx, recipe.name, x + 68, y + 22, 21, COLORS.ticketInk, 'left', true);
    // Recipe dots.
    recipe.ingredients.forEach((id, j) => {
      const ing = INGREDIENT_BY_ID[id];
      ctx.fillStyle = ing.color;
      ctx.beginPath();
      ctx.arc(x + 76 + j * 26, y + 50, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.stroke();
    });
    plainText(ctx, `${Math.ceil(ticket.patience)}s`, x + w - 14, y + 22, 18, COLORS.ticketInk, 'right', true);
    // Patience bar.
    const ratio = Math.max(0, ticket.patience / ticket.patienceMax);
    roundRect(ctx, x + 68, y + 58, w - 82, 10, 5);
    ctx.fillStyle = 'rgba(42,26,58,0.25)';
    ctx.fill();
    roundRect(ctx, x + 68, y + 58, (w - 82) * ratio, 10, 5);
    ctx.fillStyle = ratio > 0.55 ? COLORS.neonGreen : ratio > 0.25 ? COLORS.neonYellow : COLORS.neonRed;
    ctx.fill();
  }
  ctx.restore();
}

// ---- work area: bowl, wok, plate -------------------------------------------
function drawBowlStation(ctx, world, pointer) {
  const z = ZONES.bowl;
  const hover = pointInZone(pointer.x, pointer.y, z);
  roundRect(ctx, z.x - 10, z.y - 34, z.w + 20, z.h + 62, 14);
  ctx.fillStyle = hover ? '#33245c' : COLORS.counter;
  ctx.fill();
  plainText(ctx, 'BOWL — assemble here', z.x + z.w / 2, z.y - 16, 16, COLORS.neonCyan, 'center', true);
  // Bowl.
  ctx.fillStyle = COLORS.bowl;
  ctx.beginPath();
  ctx.ellipse(z.x + z.w / 2, z.y + 78, 110, 42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d8cfc0';
  ctx.beginPath();
  ctx.ellipse(z.x + z.w / 2, z.y + 70, 110, 40, 0, 0, Math.PI);
  ctx.fill();
  if (world.bowl.length > 0) {
    drawNoodlePile(ctx, z.x + z.w / 2, z.y + 72, 170, world.bowl);
  } else {
    plainText(ctx, 'empty — click ingredients below', z.x + z.w / 2, z.y + 76, 14, '#8a7a9e', 'center');
  }
  // Bowl contents as text, legible — plus the matched recipe name, so the
  // player (and the screenshot) can see a dish is ready to cook.
  if (world.bowl.length > 0) {
    const names = world.bowl.map((id) => INGREDIENT_BY_ID[id].short).join(' + ');
    plainText(ctx, names, z.x + z.w / 2, z.y + 132, 16, COLORS.text, 'center', true);
    const matched = matchRecipe(world.bowl);
    if (matched) {
      plainText(ctx, `✓ ${matched.name} — cook it! [C]`, z.x + z.w / 2, z.y + 154, 15, COLORS.neonGreen, 'center', true);
    }
  }
  // Trash button.
  const t = ZONES.trash;
  roundRect(ctx, t.x, t.y, t.w, t.h, 10);
  ctx.fillStyle = pointInZone(pointer.x, pointer.y, t) ? '#5a2a3a' : '#3a2030';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.neonRed;
  ctx.stroke();
  plainText(ctx, 'TRASH  [T]', t.x + t.w / 2, t.y + t.h / 2, 18, '#ffb3a7', 'center', true);
}

function drawWokStation(ctx, world, pointer, fx) {
  const z = ZONES.wok;
  const hover = pointInZone(pointer.x, pointer.y, z);
  roundRect(ctx, z.x - 10, z.y - 34, z.w + 20, z.h + 96, 14);
  ctx.fillStyle = hover ? '#33245c' : COLORS.counter;
  ctx.fill();
  plainText(ctx, 'WOK — click to cook  [C]', z.x + z.w / 2, z.y - 16, 16, COLORS.neonOrange, 'center', true);

  // Wok pan.
  const cx = z.x + z.w / 2;
  const cy = z.y + 82;
  ctx.fillStyle = '#3a3a44';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 130, 46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.wok;
  ctx.beginPath();
  ctx.ellipse(cx, cy - 6, 118, 40, 0, 0, Math.PI * 2);
  ctx.fill();
  // Flame glow under the wok while cooking.
  if (world.wok) {
    const flicker = 0.7 + 0.3 * Math.sin(world.elapsed * 14);
    ctx.save();
    ctx.globalAlpha = flicker;
    ctx.fillStyle = COLORS.neonOrange;
    ctx.shadowColor = COLORS.neonOrange;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 40, 90, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (world.wok) {
    drawNoodlePile(ctx, cx, cy - 8, 180, world.wok.recipe.ingredients);
    if (world.wok.burnt) {
      plainText(ctx, 'BURNT!', cx, cy - 34, 26, COLORS.neonRed, 'center', true);
    }
  } else {
    plainText(ctx, 'click a full recipe to cook', cx, cy - 8, 14, '#8a7a9e', 'center');
  }

  // Steam while cooking.
  if (world.wok && !world.wok.burnt) {
    ctx.save();
    ctx.strokeStyle = COLORS.steam;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i += 1) {
      const phase = (world.elapsed * 0.9 + i * 0.33) % 1;
      const sx = cx - 50 + i * 50 + Math.sin(phase * 6 + i) * 8;
      const sy = cy - 30 - phase * 46;
      ctx.globalAlpha = 0.55 * (1 - phase);
      ctx.beginPath();
      ctx.moveTo(sx, sy + 12);
      ctx.quadraticCurveTo(sx + 8, sy, sx - 4, sy - 10);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Cook progress bar.
  const barY = z.y + z.h + 8;
  roundRect(ctx, z.x, barY, z.w, 16, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fill();
  if (world.wok) {
    const burnRatio = Math.min(1, world.wok.cookTime / BURN_SECONDS);
    roundRect(ctx, z.x, barY, z.w * burnRatio, 16, 8);
    ctx.fillStyle = world.wok.burnt ? COLORS.neonRed : burnRatio >= 1 ? COLORS.neonGreen : COLORS.neonYellow;
    ctx.fill();
    const label = world.wok.burnt
      ? 'BURNT — press T'
      : world.wok.done
        ? 'COOKED — click the plate!'
        : `cooking ${Math.ceil(COOK_SECONDS - world.wok.cookTime)}s…`;
    plainText(ctx, label, cx, barY + 32, 16, COLORS.text, 'center', true);
  } else {
    plainText(ctx, 'wok idle', cx, barY + 32, 16, COLORS.textDim, 'center');
  }

  // Wok Toss meter.
  const mY = z.y - 78;
  plainText(ctx, 'WOK TOSS — press SPACE in the green!', cx, mY - 14, 15, COLORS.neonGreen, 'center', true);
  roundRect(ctx, z.x, mY, z.w, 18, 9);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();
  const goodX = z.x + (world.toss.greenCentre - TOSS_GOOD_HALF) * z.w;
  const goodW = TOSS_GOOD_HALF * 2 * z.w;
  const perfX = z.x + (world.toss.greenCentre - TOSS_PERFECT_HALF) * z.w;
  const perfW = TOSS_PERFECT_HALF * 2 * z.w;
  ctx.fillStyle = COLORS.neonYellow;
  ctx.fillRect(goodX, mY, goodW, 18);
  ctx.fillStyle = COLORS.neonGreen;
  ctx.fillRect(perfX, mY, perfW, 18);
  const markerX = z.x + world.toss.pos * z.w;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 8;
  ctx.fillRect(markerX - 3, mY - 4, 6, 26);
  ctx.shadowBlur = 0;
  if (!world.wok) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#0d0a1a';
    ctx.fillRect(z.x, mY - 18, z.w, 48);
    ctx.restore();
    plainText(ctx, '(starts when cooking)', cx, mY + 9, 13, COLORS.textDim, 'center');
  }

  // Perfect-toss flame burst.
  if (fx && fx.flame > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, fx.flame);
    ctx.fillStyle = COLORS.neonOrange;
    ctx.shadowColor = COLORS.neonOrange;
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 30, 70 * fx.flame + 20, 44 * fx.flame + 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.neonYellow;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 24, 40 * fx.flame + 10, 26 * fx.flame + 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // The "PERFECT TOSS!" banner itself lives in drawHud's single
    // announcement lane, so it never collides with the wok header.
    ctx.restore();
  }
}

function drawPlateStation(ctx, world, pointer) {
  const z = ZONES.plate;
  const hover = pointInZone(pointer.x, pointer.y, z);
  roundRect(ctx, z.x - 10, z.y - 34, z.w + 20, z.h + 62, 14);
  ctx.fillStyle = hover ? '#33245c' : COLORS.counter;
  ctx.fill();
  plainText(ctx, 'PLATE — ready to serve', z.x + z.w / 2, z.y - 16, 16, COLORS.neonGreen, 'center', true);
  // Plate.
  const cx = z.x + z.w / 2;
  const cy = z.y + 78;
  ctx.fillStyle = COLORS.plate;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 105, 38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d8cfc0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 84, 28, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (world.plate) {
    drawNoodlePile(ctx, cx, cy - 6, 150, world.plate.recipe.ingredients);
    plainText(ctx, world.plate.recipe.name, cx, cy + 56, 18, COLORS.text, 'center', true);
    neonText(ctx, 'READY!', cx, cy - 52, 22, COLORS.neonGreen, 'center');
  } else if (world.wok && world.wok.done && !world.wok.burnt) {
    plainText(ctx, 'cooked dish waits in the wok —', cx, cy - 6, 15, COLORS.neonYellow, 'center', true);
    plainText(ctx, 'click here to plate it!', cx, cy + 16, 15, COLORS.neonYellow, 'center', true);
  } else {
    plainText(ctx, 'no dish plated yet', cx, cy, 15, '#8a7a9e', 'center');
  }
  // Serve button.
  const s = ZONES.serve;
  const canServe = !!world.plate;
  roundRect(ctx, s.x, s.y, s.w, s.h, 10);
  ctx.fillStyle = canServe
    ? pointInZone(pointer.x, pointer.y, s)
      ? '#1f7a44'
      : '#27a35c'
    : '#2a2a33';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = canServe ? COLORS.neonGreen : '#555';
  ctx.stroke();
  plainText(ctx, 'SERVE  [Enter]', s.x + s.w / 2, s.y + s.h / 2, 20, canServe ? '#ffffff' : '#888', 'center', true);
}

// ---- counter bins ----------------------------------------------------------
function drawCounter(ctx, world, pointer) {
  roundRect(ctx, 30, 548, 1220, 140, 14);
  ctx.fillStyle = COLORS.counterTop;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#4a3670';
  ctx.stroke();
  // (No label inside the counter: the bins start at the panel's top edge,
  // so any text there would hide behind them.)
  ZONES.bins.forEach((bin, i) => {
    const ing = INGREDIENTS[i];
    const hover = pointInZone(pointer.x, pointer.y, bin);
    const inBowl = world.bowl.includes(ing.id);
    roundRect(ctx, bin.x, bin.y, bin.w, bin.h, 12);
    ctx.fillStyle = hover ? '#463278' : inBowl ? '#3a2f5e' : '#2b1d4d';
    ctx.fill();
    ctx.lineWidth = inBowl ? 3 : 2;
    ctx.strokeStyle = hover ? ing.color : '#4a3670';
    ctx.stroke();
    drawIngredientIcon(ctx, ing.icon, bin.x + bin.w / 2, bin.y + 42, 56);
    plainText(ctx, ing.name, bin.x + bin.w / 2, bin.y + 88, 19, COLORS.text, 'center', true);
    plainText(ctx, `[${ing.key}]`, bin.x + bin.w / 2, bin.y + 108, 13, COLORS.textDim, 'center');
    if (inBowl) {
      ctx.fillStyle = COLORS.neonGreen;
      ctx.beginPath();
      ctx.arc(bin.x + bin.w - 16, bin.y + 16, 11, 0, Math.PI * 2);
      ctx.fill();
      plainText(ctx, '✓', bin.x + bin.w - 16, bin.y + 17, 14, '#0d0a1a', 'center', true);
    }
  });
}

// ---- HUD -------------------------------------------------------------------
function drawHud(ctx, world, fx) {
  plainText(ctx, `SCORE  ${world.score}`, 1240, 26, 26, COLORS.neonYellow, 'right', true);
  const timeColor = world.timeLeft <= 15 ? COLORS.neonRed : COLORS.text;
  plainText(ctx, `⏱ ${Math.ceil(world.timeLeft)}s`, 1240, 56, 34, timeColor, 'right', true);
  plainText(ctx, `served ${world.served}   combo x${Math.max(1, world.combo)}`, 1240, 88, 15, COLORS.textDim, 'right');
  // One announcement lane (y ~214, between the board and the toss meter):
  // a single line only, so toasts never stack on top of each other.
  // Priority: perfect toss > latest event > combo streak.
  if (fx && fx.flame > 0) {
    neonText(ctx, 'PERFECT TOSS!', 640, 214, 26, COLORS.neonYellow, 'center');
  } else if (world.events.length > 0) {
    const event = world.events[world.events.length - 1];
    ctx.save();
    ctx.globalAlpha = Math.min(1, event.ttl);
    const color = event.kind === 'good' ? COLORS.neonGreen : event.kind === 'bad' ? COLORS.neonRed : COLORS.neonCyan;
    plainText(ctx, event.text, 640, 214, 20, color, 'center', true);
    ctx.restore();
  } else if (world.combo >= 2) {
    neonText(ctx, `COMBO x${world.combo}`, 640, 214, 26, COLORS.neonPink, 'center');
  }
  plainText(ctx, 'M mute   •   P pause   •   R restart', 640, 706, 13, COLORS.textDim, 'center');
}

// ---- screens ---------------------------------------------------------------
function drawTitle(ctx, world) {
  ctx.save();
  ctx.fillStyle = 'rgba(13, 10, 26, 0.82)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  neonText(ctx, 'NEON NOODLE STALL', 640, 150, 64, COLORS.neonPink, 'center');
  neonText(ctx, 'pasar malam • masak cepat • toss sempurna', 640, 205, 22, COLORS.neonCyan, 'center');
  plainText(ctx, 'Customers order noodle dishes. Click ingredients to fill the bowl,', 640, 270, 20, COLORS.text, 'center');
  plainText(ctx, 'cook them in the wok, then SERVE before patience runs out.', 640, 298, 20, COLORS.text, 'center');
  plainText(ctx, 'WOK TOSS: press SPACE when the marker hits the green zone —', 640, 340, 20, COLORS.neonGreen, 'center', true);
  plainText(ctx, 'a perfect toss adds flavour points and grows your combo.', 640, 368, 20, COLORS.neonGreen, 'center', true);
  plainText(ctx, '1-6 ingredients   •   C cook   •   SPACE toss   •   Enter serve   •   T trash', 640, 420, 17, COLORS.textDim, 'center');
  if (world.best > 0) plainText(ctx, `best score: ${world.best}`, 640, 448, 17, COLORS.neonYellow, 'center', true);
  const s = ZONES.start;
  roundRect(ctx, s.x, s.y, s.w, s.h, 12);
  ctx.fillStyle = COLORS.neonPink;
  ctx.shadowColor = COLORS.neonPink;
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;
  plainText(ctx, 'START COOKING', s.x + s.w / 2, s.y + s.h / 2 + 1, 24, '#ffffff', 'center', true);
  ctx.restore();
}

function drawPause(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgba(13, 10, 26, 0.75)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  neonText(ctx, 'PAUSED', 640, 330, 56, COLORS.neonCyan, 'center');
  plainText(ctx, 'press P to keep cooking', 640, 390, 20, COLORS.text, 'center');
  ctx.restore();
}

function drawGameOver(ctx, world) {
  ctx.save();
  ctx.fillStyle = 'rgba(13, 10, 26, 0.88)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  neonText(ctx, 'SERVICE OVER!', 640, 170, 56, COLORS.neonYellow, 'center');
  plainText(ctx, `final score: ${world.score}`, 640, 250, 34, COLORS.text, 'center', true);
  plainText(ctx, `dishes served: ${world.served}    best combo: x${Math.max(1, world.bestCombo)}`, 640, 300, 22, COLORS.textDim, 'center');
  plainText(
    ctx,
    `perfect tosses: ${world.stats.perfectTosses}    burnt: ${world.stats.burnt}    walked away: ${world.stats.expired}`,
    640, 340, 18, COLORS.textDim, 'center',
  );
  if (world.score >= world.best && world.score > 0) {
    neonText(ctx, 'NEW BEST SCORE!', 640, 390, 26, COLORS.neonGreen, 'center');
  }
  const s = ZONES.start;
  roundRect(ctx, s.x, s.y, s.w, s.h, 12);
  ctx.fillStyle = COLORS.neonPink;
  ctx.shadowColor = COLORS.neonPink;
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;
  plainText(ctx, 'COOK AGAIN  [R]', s.x + s.w / 2, s.y + s.h / 2 + 1, 24, '#ffffff', 'center', true);
  ctx.restore();
}

// ---- main entry ------------------------------------------------------------
export function render(ctx, world, pointer, fx) {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  drawBackground(ctx, world);
  if (world.screen === 'title') {
    // Show the stall behind the title so the first frame already reads.
    drawOrderBoard(ctx, world);
    drawBowlStation(ctx, world, pointer);
    drawWokStation(ctx, world, pointer, fx);
    drawPlateStation(ctx, world, pointer);
    drawCounter(ctx, world, pointer);
    drawTitle(ctx, world);
    return;
  }
  drawOrderBoard(ctx, world);
  drawBowlStation(ctx, world, pointer);
  drawWokStation(ctx, world, pointer, fx);
  drawPlateStation(ctx, world, pointer);
  drawCounter(ctx, world, pointer);
  drawHud(ctx, world, fx);
  if (world.screen === 'pause') drawPause(ctx);
  else if (world.screen === 'over') drawGameOver(ctx, world);
}
