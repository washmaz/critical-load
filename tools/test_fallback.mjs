// Redundancy tests: every failure path must end on a working source, with the reason recorded.
// Run from the repo root: node tools/test_fallback.mjs
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as E from '../src/engine/ephemerisStore.js';
import { liveAltAz } from './lib/lunarSky_v1.mjs';
const dir = new URL('../public/ephem/', import.meta.url).pathname;
const disk = async (p) => { const b = await readFile(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const rim = { lat: -89.684, lon: -163.261 }, t = new Date('2027-03-01T12:00:00Z');

// 1. Normal: table loads, passes self-check, auto uses it.
E.configureEphemeris({ baseUrl: dir, fetchBytes: disk });
await E.loadTable(rim, liveAltAz);
assert.equal(E.getStatus(rim).state, 'ready');
assert.equal(E.sunEarthAt(rim, t, 'auto', liveAltAz).source, 'precomputed');
assert.equal(E.sunEarthAt(rim, t, 'live', liveAltAz).source, 'live');

// 2. Date outside the table: auto falls back to live; precomputed-only returns null.
const far = new Date('2031-01-01T00:00:00Z');
assert.equal(E.sunEarthAt(rim, far, 'auto', liveAltAz).source, 'live');
assert.equal(E.sunEarthAt(rim, far, 'precomputed', liveAltAz), null);

// 3. Custom coordinates (no table): live.
const custom = { lat: -88.5, lon: 45 };
await E.loadTable(custom, liveAltAz);
assert.equal(E.getStatus(custom).state, 'none');
assert.equal(E.sunEarthAt(custom, t, 'auto', liveAltAz).source, 'live');

// 4. Server down: manifest fails -> live everywhere, no crash.
E.configureEphemeris({ baseUrl: dir, fetchBytes: async () => { throw new Error('offline'); } });
assert.equal(await E.loadTable(rim, liveAltAz), null);
assert.equal(E.sunEarthAt(rim, t, 'auto', liveAltAz).source, 'live');

// 5. Corrupted table (wrong numbers): self-check catches it and disables the table.
E.configureEphemeris({ baseUrl: dir, fetchBytes: async (p) => {
  const b = await disk(p); if (p.endsWith('.bin')) { const a = new Int16Array(b); for (let i = 0; i < a.length / 4; i++) a[i] += 50; } return b; } });
assert.equal(await E.loadTable(rim, liveAltAz), null);
assert.equal(E.getStatus(rim).state, 'disabled');
console.log('  corrupted-table status:', E.getStatus(rim).detail);

// 6. Truncated download: rejected by size check.
E.configureEphemeris({ baseUrl: dir, fetchBytes: async (p) => { const b = await disk(p); return p.endsWith('.bin') ? b.slice(0, 1000) : b; } });
assert.equal(await E.loadTable(rim, liveAltAz), null);
assert.equal(E.getStatus(rim).state, 'error');
console.log('  truncated-table status:', E.getStatus(rim).detail);

// 7. Horizons link is well formed.
const u = E.horizonsUrl(rim, '2027-03-01T00:00Z', '2027-03-02T00:00Z', '10');
assert.ok(u.startsWith('https://ssd.jpl.nasa.gov/api/horizons.api?') && u.includes('coord%40301'));
console.log('All 7 redundancy tests passed.');
