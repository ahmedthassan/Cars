// ── The Incident Report ──────────────────────────────────────────────────────
// The end card the spec asks for: who died, in what order, their final quote,
// the cause of death named, and the blame split.
//
// This is the thing players are meant to screenshot, so it is laid out to be
// readable as a still image rather than as a UI you interact with.
//
// As in crew.js, everything is built as DOM nodes with textContent — the names
// in here were typed by a person.

import { blameTable } from '../dialogue/memory.js';
import { nameOf } from '../roster.js';

const el = (tag, cls) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
};

function heading(text) {
  const h = el('div', 'reporthead');
  h.textContent = text;
  return h;
}

/**
 * Render the report body into `container`.
 *
 * Split into two columns because the target device is a landscape phone —
 * short and wide — and the whole point of this card is that it fits in one
 * screenshot. A single stacked list pushed the blame split and the buttons
 * below the fold on a 420px-tall screen.
 */
export function renderReport(container, { memory, survivors }) {
  container.replaceChildren();
  const grid = el('div', 'reportgrid');
  const main = el('div', 'col-main');
  const side = el('div', 'col-side');
  grid.append(main, side);
  container.appendChild(grid);

  if (memory.incidents.length) {
    main.appendChild(heading(
      memory.incidents.length === 1 ? '1 incident' : `${memory.incidents.length} incidents`,
    ));
    for (const inc of memory.incidents) {
      const row = el('div', 'incident');

      const n = el('div', 'n');
      n.textContent = String(inc.order);
      row.appendChild(n);

      const body = el('div');
      const who = el('div', 'who');
      who.textContent = nameOf(inc.botId);
      who.style.color = '#eef4fa';
      body.appendChild(who);

      const cause = el('div', 'cause');
      // Altitude is worth showing: "at 82%" is the difference between a sad
      // story and an infuriating one.
      cause.textContent = inc.altitude != null
        ? `${inc.label.toUpperCase()} — AT ${Math.round(inc.altitude * 100)}%`
        : inc.label.toUpperCase();
      body.appendChild(cause);

      if (inc.quote) {
        const q = el('div', 'quote');
        q.textContent = `“${inc.quote}”`;
        body.appendChild(q);
      }
      row.appendChild(body);
      main.appendChild(row);
    }
  } else {
    main.appendChild(heading('No incidents'));
    const none = el('div', 'survivors');
    none.textContent = 'Everybody made it. Nobody will believe you.';
    main.appendChild(none);
  }

  if (survivors.length) {
    side.appendChild(heading('Still aboard'));
    const alive = el('div', 'survivors');
    alive.textContent = survivors.map(nameOf).join(', ');
    side.appendChild(alive);
  }

  const blame = blameTable(memory);
  if (blame.length) {
    side.appendChild(heading('Blame'));
    const max = blame[0].pct || 1;
    for (const b of blame) {
      const row = el('div', 'blamerow');
      const who = el('div', 'bwho');
      who.textContent = nameOf(b.who);
      const bar = el('div', 'bbar');
      const fill = el('div', 'bfill');
      // Bars are scaled against the biggest share so the top one always fills
      // the row; the number next to it carries the real value.
      fill.style.width = `${Math.max(4, (b.pct / max) * 100)}%`;
      if (b.who !== 'driver') fill.style.background = '#7c8798';
      bar.appendChild(fill);
      const pct = el('div', 'bpct');
      pct.textContent = `${b.pct}%`;
      row.append(who, bar, pct);
      side.appendChild(row);
    }
  }
}

/** The same report as plain text, for sharing or the clipboard. */
export function reportText({ memory, survivors, title, detail }) {
  const lines = [`ROBOT HAUL — ${title}`, detail, ''];

  if (memory.incidents.length) {
    lines.push('INCIDENT REPORT');
    for (const inc of memory.incidents) {
      const at = inc.altitude != null ? ` at ${Math.round(inc.altitude * 100)}%` : '';
      lines.push(`${inc.order}. ${nameOf(inc.botId)} — ${inc.label}${at}`);
      if (inc.quote) lines.push(`   "${inc.quote}"`);
    }
  } else {
    lines.push('No incidents. Everybody made it.');
  }

  if (survivors.length) {
    lines.push('', `Still aboard: ${survivors.map(nameOf).join(', ')}`);
  }
  const blame = blameTable(memory);
  if (blame.length) {
    lines.push('', `Blame: ${blame.map((b) => `${nameOf(b.who)} ${b.pct}%`).join('  ')}`);
  }
  return lines.filter((l) => l !== undefined).join('\n');
}

/**
 * Share the report. Uses the native share sheet where there is one, falls back
 * to the clipboard, and reports honestly when neither is available rather than
 * silently doing nothing.
 */
export async function shareReport(text) {
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Robot Haul', text });
      return 'shared';
    }
  } catch (e) {
    // A user dismissing the share sheet throws AbortError; that is not a
    // failure and should not fall through to the clipboard.
    if (e && e.name === 'AbortError') return 'cancelled';
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'unavailable';
  }
}
