// Multi-team review: data gathering at the 11 polar sites, ranking, clashes and sensitivity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { setTileFetcher } from '../src/engine/tiles.js';
import { siteData, evaluate, sensitivity, DEFAULT_TEAM_INPUTS } from '../src/engine/teamReview.js';
import { SITES } from '../src/engine/sites.js';

const DIR = new URL('../data/tiles/', import.meta.url);
const have = existsSync(new URL('meta.json', DIR));
setTileFetcher(async (p) => { const b = readFileSync(new URL(p, DIR)); return b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b) : b; });

test('team review ranks the polar sites, lists clashes and runs the sensitivity sweep', { skip: !have && 'no tiles' }, async () => {
  const L = Date.parse('2026-11-14T21:00Z'), inp = DEFAULT_TEAM_INPUTS;
  const data = [];
  for (const s of SITES.filter((x) => x.lat < -80)) data.push(await siteData(s, L, inp));
  const ev = evaluate(data, inp), sen = sensitivity(data, inp);
  console.log(ev.rows.map((r) => [r.site.id, r.fails.join('+') || 'pass', r.score.toFixed(3)]), ev.favourites, sen.stablePct, sen.cases.filter((c) => !c.same));
  assert.equal(ev.rows.length, 11);
  for (let i = 1; i < ev.rows.length; i++) assert.ok(ev.rows[i - 1].fails.length <= ev.rows[i].fails.length);
  // power pass/fail must agree with the app's single-site verdict rule
  for (const r of ev.rows) { const d = data.find((x) => x.site.id === r.site.id).metrics; assert.equal(r.teams.power.pass, d.sunlitPct > 0 && d.longestDarkH <= inp.power.batteryHours); }
  // failing sites are never ranked above passing ones
  const firstFail = ev.rows.findIndex((r) => r.fails.length); if (firstFail >= 0) assert.ok(ev.rows.slice(firstFail).every((r) => r.fails.length));
  assert.ok(sen.cases.length > 0 && sen.stablePct >= 0 && sen.stablePct <= 100);
});

test('custom criteria: score enters the weighted ranking, pass/fail acts as a hard limit, unrated is left out', { skip: !have && 'no tiles' }, async () => {
  const L = Date.parse('2026-11-14T21:00Z');
  const ids = ['mons-mouton-plateau', 'haworth', 'nobile-rim-2'];
  const data = [];
  for (const id of ids) data.push(await siteData(SITES.find((s) => s.id === id), L, DEFAULT_TEAM_INPUTS));
  const base = evaluate(data, DEFAULT_TEAM_INPUTS);
  assert.deepEqual(base.unrated, []);
  // a heavily weighted score criterion that only Haworth gets full marks on must lift Haworth relative to the others
  const sc = { id: 'x', name: 'Traverse to target', owner: 'Science', kind: 'score', weight: 5, values: { haworth: 100, 'mons-mouton-plateau': 0 } };
  const ev = evaluate(data, { ...DEFAULT_TEAM_INPUTS, custom: [sc] });
  const row = (e, id) => e.rows.find((r) => r.site.id === id);
  assert.ok(row(ev, 'haworth').score > row(base, 'haworth').score);
  assert.ok(row(ev, 'mons-mouton-plateau').score < row(base, 'mons-mouton-plateau').score);
  assert.equal(row(ev, 'nobile-rim-2').score, row(base, 'nobile-rim-2').score); // unrated: unchanged
  assert.deepEqual(ev.unrated, [{ name: 'Traverse to target', sites: [row(ev, 'nobile-rim-2').site.name] }]);
  assert.equal(ev.labels['custom:x'], 'Traverse to target');
  // a pass/fail criterion failing a site adds a fail and moves it below the passing sites
  const pf = { id: 'y', name: 'Range safety', owner: 'Mission', kind: 'pass', weight: 0, values: { 'mons-mouton-plateau': false } };
  const ev2 = evaluate(data, { ...DEFAULT_TEAM_INPUTS, custom: [pf] });
  assert.ok(row(ev2, 'mons-mouton-plateau').fails.includes('custom:y'));
  assert.equal(row(ev2, 'mons-mouton-plateau').score, row(base, 'mons-mouton-plateau').score); // pass/fail never changes the score
  // the sensitivity sweep includes the custom weight
  const sen = sensitivity(data, { ...DEFAULT_TEAM_INPUTS, custom: [sc] });
  assert.ok(sen.cases.some((c) => c.label.startsWith('Traverse to target weight')));
});
