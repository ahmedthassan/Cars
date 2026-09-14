// ── Crew screen ──────────────────────────────────────────────────────────────
// Renaming the bots is, per the spec, the distribution channel: players type
// their friends' names, screenshot the Incident Report, and send it.
//
// Everything here builds real DOM nodes and sets `textContent` rather than
// assembling an HTML string. The values are typed by a person and then shown
// back to them, so string concatenation into innerHTML would let a name
// containing markup break the screen (or worse) — and the safe version is no
// harder to write.

import { DRIVER, ROBOTS } from '../config.js';
import { MAX_NAME, nameOf, resetNames, roster, setName } from '../roster.js';

const el = (tag, cls) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
};

/**
 * Draw the editable crew list into `container`.
 * `onChange` fires after any edit so the caller can refresh anything showing
 * a name.
 */
export function renderCrew(container, onChange = () => {}) {
  container.replaceChildren();

  // Dadbot is in the list too. Naming the driver after someone specific is
  // most of the joke.
  const people = [...roster(), { ...DRIVER, role: 'Driver. Watched one driving tutorial.' }];

  for (const person of people) {
    const row = el('div', 'crewrow');

    const chip = el('div', 'crewchip');
    chip.style.background = person.color;
    chip.textContent = person.face;
    row.appendChild(chip);

    const input = el('input');
    input.type = 'text';
    input.value = nameOf(person.id);
    input.maxLength = MAX_NAME;
    input.setAttribute('aria-label', `Name for ${person.name}`);
    input.autocomplete = 'off';
    input.autocapitalize = 'words';
    input.spellcheck = false;
    // `change` alone would miss a player who types a name and taps straight
    // into the game without blurring the field.
    const commit = () => {
      const stuck = setName(person.id, input.value);
      if (stuck !== null && stuck !== input.value) input.value = stuck;
      onChange();
    };
    input.addEventListener('input', commit);
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    row.appendChild(input);

    const job = el('div', 'crewjob');
    job.textContent = person.role || '';
    row.appendChild(job);

    container.appendChild(row);
  }
}

export function resetCrew(container, onChange = () => {}) {
  resetNames();
  renderCrew(container, onChange);
  onChange();
}

export { ROBOTS };
