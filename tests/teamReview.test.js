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
  for (const r of ev.rows) { const d = data.find((x) => x.site.id === r.site.id).metrics; assert.equal(r.teams.power.pass, d.sunlitPct > 0 && d.longestDarkH <= 48); }
  assert.ok(sen.cases.length > 0 && sen.stablePct >= 0 && sen.stablePct <= 100);
});
