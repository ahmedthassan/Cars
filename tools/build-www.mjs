// Assemble www/ — the directory Capacitor wraps into the native apps, and the
// same directory you can drop on any static host for the web build.
//
// The game is plain ES modules with no bundler, so "building" is really just
// staging files and renaming the entry point to index.html.

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const OUT = 'www';

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// The web entry is mountain-truck.html; native shells and hosts want index.html.
const html = await readFile('mountain-truck.html', 'utf8');
await writeFile(`${OUT}/index.html`, html);

for (const dir of ['src', 'vendor', 'icons']) {
  if (existsSync(dir)) await cp(dir, `${OUT}/${dir}`, { recursive: true });
}
for (const file of ['manifest.webmanifest', 'sw.js']) {
  if (existsSync(file)) await cp(file, `${OUT}/${file}`);
}

// The service worker must know exactly what to cache, and that list has to be
// derived from what actually shipped rather than hand-maintained — a stale
// entry means the game half-loads offline, which is worse than not caching.
const { readdir } = await import('node:fs/promises');
async function walk(dir, base = '') {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...await walk(`${dir}/${e.name}`, rel));
    else out.push(rel);
  }
  return out;
}
const assets = (await walk(OUT)).filter((f) => f !== 'sw.js');
const manifestList = ['./', ...assets.map((f) => `./${f}`)];

if (existsSync(`${OUT}/sw.js`)) {
  let sw = await readFile(`${OUT}/sw.js`, 'utf8');
  sw = sw.replace('/* __PRECACHE__ */[]', JSON.stringify(manifestList, null, 2));
  // Cache name carries a build stamp so a redeploy actually replaces the old
  // cache instead of serving last week's game forever.
  sw = sw.replace('__BUILD__', String(Date.now()));
  await writeFile(`${OUT}/sw.js`, sw);
}

console.log(`www/ built — ${assets.length} files, ${manifestList.length} precached`);
