// ── Level select ─────────────────────────────────────────────────────────────
// Four cards, in order, with their hazard, their weather and what you managed
// last time. Locked levels stay visible — seeing the Volcano sitting there
// greyed out is part of what makes you go back at the Mountain.
//
// DOM nodes and textContent, as in crew.js and report.js.

import { LEVELS } from '../levels/index.js';
import { bestFor, isBeaten, isUnlocked } from '../progress.js';

const el = (tag, cls) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
};

const WEATHER_LABEL = {
  snow: 'Snow', sand: 'Blowing sand', rain: 'Rain and lightning', ash: 'Ash and embers',
};

export function renderLevels(container, { onPick, activeId }) {
  container.replaceChildren();

  for (const lv of LEVELS) {
    const unlocked = isUnlocked(lv.id);
    const card = el('button', `levelcard${unlocked ? '' : ' locked'}${lv.id === activeId ? ' active' : ''}`);
    card.type = 'button';
    card.disabled = !unlocked;

    const swatch = el('div', 'levelswatch');
    // The card wears the level's own sky, so the list doubles as a preview.
    swatch.style.background = `linear-gradient(160deg, ${lv.theme.sky.join(', ')})`;
    const num = el('div', 'levelnum');
    num.textContent = unlocked ? String(lv.difficulty) : '🔒';
    swatch.appendChild(num);
    card.appendChild(swatch);

    const body = el('div', 'levelbody');
    const name = el('div', 'levelname');
    name.textContent = lv.name;
    body.appendChild(name);

    const haz = el('div', 'levelhazard');
    haz.textContent = unlocked ? lv.hazard : 'Finish the level before this one';
    body.appendChild(haz);

    const meta = el('div', 'levelmeta');
    const bits = [WEATHER_LABEL[lv.theme.weather?.kind] || 'Clear'];
    const best = bestFor(lv.id);
    if (best) {
      bits.push(best.won
        ? `Best: ${best.crew} home`
        : `Best: ${Math.round(best.altitude * 100)}% up`);
    }
    if (isBeaten(lv.id)) bits.push('✓ Cleared');
    meta.textContent = bits.join('  ·  ');
    body.appendChild(meta);

    card.appendChild(body);
    if (unlocked) card.addEventListener('click', () => onPick(lv.id));
    container.appendChild(card);
  }
}
