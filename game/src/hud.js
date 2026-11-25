// hud.js — DOM overlay for Evening Noodle House.
// All text is English, and DOM text stays sharp at any size (the 3D scene
// is canvas/WebGL, the words are real HTML). The HUD owns: order board,
// timer / score / served / combo, the Wok Toss meter, the toast line, the
// ingredient bins + action buttons, and the title / pause / game-over
// screens. main.js calls update(world, fx) once per frame; the ticket list
// is only rebuilt when its contents actually change.
import { INGREDIENTS, INGREDIENT_BY_ID, RECIPE_BY_ID, matchRecipe } from './recipes.js';

const FACE_EMOJI = { happy: '🙂', worried: '😟', angry: '😠' };

function el(id) {
  return document.getElementById(id);
}

export function createHud(actions) {
  const binsEl = el('bins');
  const binButtons = {};
  for (const ing of INGREDIENTS) {
    const button = document.createElement('button');
    button.className = 'bin';
    button.type = 'button';
    button.dataset.id = ing.id;
    button.innerHTML = `<span class="dot" style="background:${ing.color}"></span>`
      + `<span class="bin-name">${ing.name}</span><span class="bin-key">[${ing.key}]</span>`;
    button.addEventListener('click', () => actions.addIngredient(ing.id));
    binsEl.appendChild(button);
    binButtons[ing.id] = button;
  }

  el('btn-cook').addEventListener('click', () => actions.startCooking());
  el('btn-toss').addEventListener('click', () => actions.toss());
  el('btn-serve').addEventListener('click', () => {
    if (!actions.plateDish()) actions.serve();
  });
  el('btn-trash').addEventListener('click', () => actions.trash());
  el('btn-start').addEventListener('click', () => actions.start());
  el('btn-resume').addEventListener('click', () => actions.togglePause());
  el('btn-again').addEventListener('click', () => actions.restart());

  let lastTicketSig = '';
  let lastToastSig = '';

  function renderTickets(world) {
    const sig = world.tickets
      .map((t) => `${t.id}:${t.recipeId}:${Math.ceil(t.patience)}:${t.face}`)
      .join('|');
    if (sig === lastTicketSig) return;
    lastTicketSig = sig;
    const board = el('tickets');
    board.innerHTML = '';
    if (world.tickets.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ticket-empty';
      empty.textContent = 'Waiting for a customer…';
      board.appendChild(empty);
      return;
    }
    for (const ticket of world.tickets) {
      const recipe = RECIPE_BY_ID[ticket.recipeId];
      const div = document.createElement('div');
      div.className = 'ticket';
      const ratio = ticket.patience / ticket.patienceMax;
      const barClass = ratio > 0.55 ? 'ok' : ratio > 0.25 ? 'warn' : 'bad';
      const dots = (recipe ? recipe.ingredients : [])
        .map((id) => `<span class="dot" style="background:${INGREDIENT_BY_ID[id].color}"></span>`)
        .join('');
      div.innerHTML = `<span class="face">${FACE_EMOJI[ticket.face] || '🙂'}</span>`
        + `<span class="tname">${recipe ? (recipe.short || recipe.name) : ticket.recipeId}</span>`
        + `<span class="ptime">${Math.ceil(ticket.patience)}s</span>`
        + `<span class="trow2"><span class="tdots">${dots}</span>`
        + `<span class="pbar"><span class="pfill ${barClass}" style="width:${Math.max(0, ratio * 100)}%"></span></span></span>`;
      board.appendChild(div);
    }
  }

  function update(world, fx) {
    const playing = world.screen === 'play';
    renderTickets(world);

    el('score').textContent = String(world.score);
    const timer = el('timer');
    timer.textContent = `${Math.ceil(world.timeLeft)}s`;
    timer.classList.toggle('low', world.timeLeft <= 15);
    el('served').textContent = String(world.served);
    el('combo').textContent = `x${Math.max(1, world.combo)}`;

    // Wok Toss meter: visible only while something cooks.
    const meter = el('toss-meter');
    if (world.wok && playing) {
      meter.classList.remove('hidden');
      const green = world.toss.greenCentre;
      el('toss-green').style.left = `${(green - 0.07) * 100}%`;
      el('toss-green').style.width = '14%';
      el('toss-marker').style.left = `${world.toss.pos * 100}%`;
      meter.classList.toggle('done', world.wok.done);
    } else {
      meter.classList.add('hidden');
    }

    // Toast: the newest event only, so lines never stack. When a dish
    // waits on the plate with no fresh event, say so — the cover shot
    // stages past the event's lifetime.
    const toast = el('toast');
    const last = world.events[world.events.length - 1];
    const toastText = last
      ? last.text
      : world.plate
        ? `${world.plate.recipe.name} ready — serve it!`
        : '';
    const toastKind = last ? last.kind : 'info';
    const toastSig = toastText ? `${toastText}|${toastKind}` : '';
    if (toastSig !== lastToastSig) {
      lastToastSig = toastSig;
      toast.textContent = toastText;
      toast.className = toastText ? `show ${toastKind}` : '';
    }

    // Buttons.
    const canCook = playing && !world.wok && !!matchRecipe(world.bowl);
    const canToss = playing && !!world.wok;
    const canServe = playing && !!world.plate;
    const canTrash = playing && (world.bowl.length > 0 || !!world.wok);
    el('btn-cook').disabled = !canCook;
    el('btn-toss').disabled = !canToss;
    el('btn-serve').disabled = !canServe;
    el('btn-trash').disabled = !canTrash;
    for (const ing of INGREDIENTS) {
      const button = binButtons[ing.id];
      button.disabled = !playing || world.bowl.length >= 4 || !!world.wok;
      button.classList.toggle('in-bowl', world.bowl.includes(ing.id));
    }
    const bowlDots = world.bowl
      .map((id) => `<span class="dot" style="background:${INGREDIENT_BY_ID[id].color}"></span>`)
      .join('');
    el('bowl-status').innerHTML = world.bowl.length > 0
      ? `Bowl: ${bowlDots}`
      : 'Bowl empty — click ingredients below';

    // Screens.
    el('screen-title').classList.toggle('hidden', world.screen !== 'title');
    el('screen-pause').classList.toggle('hidden', world.screen !== 'pause');
    el('screen-over').classList.toggle('hidden', world.screen !== 'over');
    if (world.screen === 'title') {
      el('best-line').textContent = world.best > 0
        ? `Best score: ${world.best}`
        : 'Your first shift starts at dusk.';
    }
    if (world.screen === 'over') {
      el('final-score').textContent = String(world.score);
      el('final-served').textContent = String(world.served);
      el('final-combo').textContent = `x${Math.max(1, world.bestCombo)}`;
      el('final-best').textContent = String(world.best);
    }
  }

  return { update };
}
