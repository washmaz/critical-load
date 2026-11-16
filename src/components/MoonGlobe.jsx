import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { fmtLat, fmtLon } from '../format.js';

// 3D whole-Moon globe (presentation only; no engine code is called from here).
// Imagery: NASA Solar System Treks (Moon Trek) WMTS, equirectangular (EQ) tiles, the same NASA source as the
// earlier 2D whole-Moon map. Moon Trek's EQ grid has 2 x 1 tiles at level 0, so level L is 2^(L+1) x 2^L tiles of 256 px,
// i.e. a plain lat/lon image that wraps straight onto a sphere.
//   Visible: LRO WAC Global Mosaic 303 ppd v02 (NASA LRO LROC / Arizona State University)
//   Terrain: LRO LOLA colour shaded relief 256 ppd v06 (NASA LRO LOLA)
const LAYERS = {
  // NASA SVS CGI Moon Kit (svs.gsfc.nasa.gov/4720): LROC WAC natural-colour mosaic with the poles filled, plus LOLA
  // elevation for relief shading. NASA's server doesn't allow cross-site loading, so web-sized copies live in
  // public/moon/ (converted from lroc_color_poles_8k.tif and ldem_16_uint.tif; same pixels, resized / 8-bit).
  moonkit: { label: 'Natural colour', kit: true, credit: "NASA's Scientific Visualization Studio, CGI Moon Kit (LRO LROC WAC colour mosaic, LRO LOLA elevation)" },
  visible: { label: 'Grey (WAC)', url: 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm', ext: 'jpg', credit: 'NASA LRO LROC WAC Global Mosaic 303 ppd v02 (LROC / ASU)' },
  terrain: { label: 'Terrain relief', url: 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_ClrShade_Global_256ppd_v06/1.0.0/default/default028mm', ext: 'png', credit: 'NASA LRO LOLA colour shaded relief 256 ppd v06' },
};
const COLOR = { GO: '#47da84', CAUTION: '#ffb020', 'NO-GO': '#ff5c52' }; // same as the polar map
const D2R = Math.PI / 180;
const FOV = 30;
const DIST_HOME = 4.6, DIST_MIN = 1.12, DIST_MAX = 9;
const short = (n) => n.replace(/ \(Artemis III region\)/, '').replace(/ \(.*\)$/, '');

// lat/lon (deg, lon east) -> unit vector, matching three.js SphereGeometry's UV layout
// (u = 0 at the image's left edge = 180°W; v = 0 at the top = 90°N). 0°E faces +x, 90°E faces -z, north is +y.
function vec(lat, lon, r = 1) {
  const phi = (lon + 180) * D2R, th = (90 - lat) * D2R;
  return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(th), r * Math.cos(th), r * Math.sin(phi) * Math.sin(th));
}
function latLonOf(p) {
  const n = p.clone().normalize();
  const lat = Math.asin(Math.max(-1, Math.min(1, n.y))) / D2R;
  let lon = Math.atan2(n.z, -n.x) / D2R - 180;
  if (lon < -180) lon += 360; if (lon > 180) lon -= 360;
  return [lat, lon];
}
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function MoonGlobe({ sites, statusById = {}, currentId, custom, onPick, onPickPoint, focusKey = 0, currentStatus, lead }) {
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const readoutRef = useRef(null);
  const pinRefs = useRef({});
  const customRef = useRef(null);
  const api = useRef(null);
  const [layer, setLayer] = useState('moonkit');
  const [layersOpen, setLayersOpen] = useState(false);
  const [hoverId, setHoverId] = useState(null);
  const [failed, setFailed] = useState(null);
  const [loadPct, setLoadPct] = useState(0);
  const cb = useRef({});
  cb.current = { onPick, onPickPoint };

  // ---- one-time three.js setup ----
  useEffect(() => {
    const box = boxRef.current, canvas = canvasRef.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
    } catch (e) {
      setFailed('Your browser could not start 3D graphics (WebGL). Use the South pole map tab instead.');
      return undefined;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100);

    // Globe: placeholder grey until the NASA tiles arrive (no blank flash, no layout change).
    const geo = new THREE.SphereGeometry(1, 192, 96);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 1, metalness: 0 });
    const globe = new THREE.Mesh(geo, mat);
    scene.add(globe);
    // Soft "headlight" so the globe reads as a sphere; the NASA mosaics already carry their own shading.
    // Light: soft fill plus a key light from the upper left of the view, so the LOLA relief reads as 3D craters.
    const amb = new THREE.AmbientLight(0xffffff, 1.15);
    scene.add(amb);
    const head = new THREE.DirectionalLight(0xffffff, 2.4);
    scene.add(head);

    // South-polar cap (80–90°S): the app's own NASA LOLA shaded relief (the South pole map's background,
    // polar stereographic, 0°E at the top). Equirectangular mosaics smear into streaks near the pole on a sphere;
    // this cap shows the real relief there instead, and matches the polar map and the 80°S terrain ring.
    const capGeo = new THREE.SphereGeometry(1.0006, 192, 24, 0, Math.PI * 2, (170 * Math.PI) / 180, (10 * Math.PI) / 180);
    {
      const pos = capGeo.attributes.position, uv = capGeo.attributes.uv, R = 1737400, EXT = 304000, v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const [la, lo] = latLonOf(v);
        const rho = 2 * R * Math.tan(Math.PI / 4 + (la * D2R) / 2);
        const x = rho * Math.sin(lo * D2R), y = rho * Math.cos(lo * D2R);
        uv.setXY(i, (x + EXT) / (2 * EXT), 1 - (EXT - y) / (2 * EXT));
      }
      uv.needsUpdate = true;
    }
    const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, transparent: true, opacity: 0 });
    const cap = new THREE.Mesh(capGeo, capMat);
    scene.add(cap);
    new THREE.TextureLoader().load('/map/lola_south_pole_80S.jpg', (t) => {
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      capMat.map = t; capMat.opacity = 1; capMat.transparent = false; capMat.needsUpdate = true; redraw();
    });

    // Graticule every 30°, plus the 80°S ring: inside it the app has real NASA LOLA terrain.
    const lines = new THREE.Group();
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, depthWrite: false });
    const ring = (lat, m) => { const pts = []; for (let lo = -180; lo <= 180; lo += 2) pts.push(vec(lat, lo, 1.0015)); lines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), m)); };
    for (let la = -60; la <= 60; la += 30) ring(la, lineMat);
    for (let lo = -180; lo < 180; lo += 30) { const pts = []; for (let la = -90; la <= 90; la += 2) pts.push(vec(la, lo, 1.0015)); lines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat)); }
    const terrainMat = new THREE.LineDashedMaterial({ color: 0xffc845, dashSize: 0.02, gapSize: 0.015, transparent: true, opacity: 0.8, depthWrite: false });
    { const pts = []; for (let lo = -180; lo <= 180; lo += 1) pts.push(vec(-80, lo, 1.002)); const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), terrainMat); l.computeLineDistances(); lines.add(l); }
    scene.add(lines);

    // ---- view state: camera orbits the fixed globe ----
    const view = { lat: 0, lon: 0, dist: DIST_HOME, vLat: 0, vLon: 0 };
    let fly = null, raf = 0, dirty = true, w = 1, h = 1;
    let drag = null, pinch = null;
    const place = () => {
      view.lat = Math.max(-89, Math.min(89, view.lat));
      view.lon = ((view.lon + 540) % 360) - 180;
      view.dist = Math.max(DIST_MIN, Math.min(DIST_MAX, view.dist));
      camera.position.copy(vec(view.lat, view.lon, view.dist));
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
      head.position.copy(camera.position).add(new THREE.Vector3(-0.9 * view.dist, 0.7 * view.dist, 0).applyQuaternion(camera.quaternion));
      camera.near = Math.max(0.005, (view.dist - 1) * 0.5);
      camera.updateProjectionMatrix();
    };
    const tmp = new THREE.Vector3();
    const updateOverlay = () => {
      const cam = camera.position;
      const show = (el, p) => {
        if (!el) return;
        const facing = p.dot(cam) > 1.0005; // visible from the camera (in front of the limb)
        tmp.copy(p).project(camera);
        if (!facing || tmp.z > 1) { el.style.visibility = 'hidden'; return; }
        el.style.visibility = 'visible';
        el.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px)`;
      };
      for (const s of api.current.sites) show(pinRefs.current[s.id], api.current.pinVec[s.id]);
      if (api.current.customVec) show(customRef.current, api.current.customVec);
    };
    const frame = (t) => {
      raf = 0;
      let again = false;
      if (fly) {
        const k = Math.min(1, (t - fly.t0) / fly.ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        view.lat = fly.lat0 + (fly.lat1 - fly.lat0) * e;
        view.lon = fly.lon0 + fly.dLon * e;
        view.dist = fly.d0 + (fly.d1 - fly.d0) * e;
        if (k >= 1) fly = null; else again = true;
      } else if (!drag && !pinch && (Math.abs(view.vLat) > 0.01 || Math.abs(view.vLon) > 0.01)) {
        // inertia after a drag
        view.lat += view.vLat; view.lon += view.vLon; view.vLat *= 0.9; view.vLon *= 0.9; again = true;
      }
      if (again || dirty) {
        place();
        renderer.render(scene, camera);
        updateOverlay();
        dirty = false;
      }
      if (again) request();
    };
    const request = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const redraw = () => { dirty = true; request(); };
    const flyTo = (lat, lon, dist = view.dist) => {
      view.vLat = view.vLon = 0;
      let dLon = lon - view.lon; dLon = ((dLon + 540) % 360) - 180; // shortest way round
      const ms = reduceMotion() ? 1 : 900;
      fly = { t0: performance.now(), ms, lat0: view.lat, lat1: Math.max(-89, Math.min(89, lat)), lon0: view.lon, dLon, d0: view.dist, d1: dist };
      request();
    };

    // ---- size ----
    const resize = () => {
      w = Math.max(1, box.clientWidth); h = Math.max(1, box.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      redraw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    resize();

    // ---- input: drag to turn, wheel / pinch to zoom, click to pick ----
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = (cx, cy) => {
      const r = canvas.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObject(globe, false);
      return hits.length ? latLonOf(hits[0].point) : null;
    };
    const showReadout = (ll) => {
      if (!readoutRef.current) return;
      readoutRef.current.textContent = ll ? `${fmtLat(ll[0])}   ${fmtLon(ll[1])}` : '--';
    };
    const ptrs = new Map();
    // One screen pixel = one pixel of arc on the globe: the surface follows the cursor at any zoom.
    const degPerPx = () => (57.3 * Math.tan((FOV / 2) * D2R) * Math.sqrt(view.dist * view.dist - 1)) / (h / 2);
    const onDown = (e) => {
      canvas.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      fly = null; view.vLat = view.vLon = 0;
      if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: 0, t: performance.now() };
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: view.dist }; drag = null; }
    };
    const onMove = (e) => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        view.dist = 1 + (pinch.dist - 1) * (pinch.d / Math.max(1, d)); redraw(); return;
      }
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y, k = degPerPx();
        drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0));
        view.lon -= dx * k; view.lat += dy * k;
        view.vLon = -dx * k * 0.5; view.vLat = dy * k * 0.5;
        drag.x = e.clientX; drag.y = e.clientY; drag.t = performance.now();
        redraw();
        return;
      }
      if (e.pointerType === 'mouse') showReadout(hit(e.clientX, e.clientY));
    };
    const onUp = (e) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (drag && ptrs.size === 0) {
        if (drag.moved < 5) {
          view.vLat = view.vLon = 0;
          const ll = hit(e.clientX, e.clientY);
          showReadout(ll); // touch screens have no hover, so show the tapped point
          if (ll && cb.current.onPickPoint) cb.current.onPickPoint(Math.round(ll[0] * 1e4) / 1e4, Math.round(ll[1] * 1e4) / 1e4);
        } else if (performance.now() - drag.t > 80 || reduceMotion()) { view.vLat = view.vLon = 0; }
        drag = null;
        request();
      }
    };
    const onWheel = (e) => {
      const f = Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
      const next = 1 + (view.dist - 1) * f;
      // At the zoom limits, let the page scroll instead of trapping the wheel.
      if ((f > 1 && view.dist >= DIST_MAX - 1e-3) || (f < 1 && view.dist <= DIST_MIN + 1e-3)) return;
      e.preventDefault();
      fly = null; view.dist = next; redraw();
    };
    const onLeave = () => showReadout(null);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // ---- NASA Moon Trek tiles -> one equirectangular texture, coarse level first, then sharper ----
    const maxTex = renderer.capabilities.maxTextureSize || 4096;
    const levels = maxTex >= 4096 ? [2, 3] : [2];
    let texture = null, cancelled = false, loadToken = 0;
    // CGI Moon Kit: small images first (fast), then the sharpest this screen and GPU can take.
    const bigKit = maxTex >= 8192 && Math.min(window.screen.width, window.screen.height) >= 700 ? '8k' : '4k';
    const texLoader = new THREE.TextureLoader();
    let bump = null;
    const loadTex = (url) => new Promise((ok, no) => texLoader.load(url, ok, undefined, no));
    const setBump = (t) => { if (bump) bump.dispose(); bump = t; t.anisotropy = 4; mat.bumpMap = t; mat.bumpScale = 1.6; mat.needsUpdate = true; redraw(); };
    const loadKit = async (token) => {
      setLoadPct(5);
      try {
        const [c2, b2] = await Promise.all([loadTex('/moon/lroc_color_2k.webp'), loadTex('/moon/ldem_2k.webp')]);
        if (cancelled || token !== loadToken) { c2.dispose(); b2.dispose(); return; }
        c2.colorSpace = THREE.SRGBColorSpace; c2.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        if (texture) texture.dispose(); texture = c2; mat.map = c2; mat.color.set(0xffffff); mat.needsUpdate = true; setBump(b2); setLoadPct(40);
        const [cBig, bBig] = await Promise.all([loadTex(`/moon/lroc_color_${bigKit}.webp`), loadTex('/moon/ldem_4k.webp')]);
        if (cancelled || token !== loadToken) { cBig.dispose(); bBig.dispose(); return; }
        cBig.colorSpace = THREE.SRGBColorSpace; cBig.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        texture.dispose(); texture = cBig; mat.map = cBig; mat.needsUpdate = true; setBump(bBig); setLoadPct(100);
      } catch (e) {
        // Colour images not available (e.g. not uploaded yet): fall back to the NASA Moon Trek grey mosaic.
        if (!cancelled && token === loadToken) { setLoadPct(0); setLayer('visible'); }
      }
    };
    const loadLayer = (key) => {
      const L = LAYERS[key], token = ++loadToken;
      // The polar relief image is a cool grey; warm it to sit next to the natural-colour mosaic (presentation only).
      if (L.kit) capMat.color.setRGB(1.24, 1.17, 1.06, THREE.SRGBColorSpace); else capMat.color.setRGB(1, 1, 1);
      if (L.kit) { loadKit(token); return; }
      const top = levels[levels.length - 1];
      const cv = document.createElement('canvas');
      cv.width = 256 * 2 ** (top + 1); cv.height = 256 * 2 ** top;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#6f6f6f'; ctx.fillRect(0, 0, cv.width, cv.height);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      let shown = false, pendingUpload = 0;
      const upload = () => { pendingUpload = 0; if (cancelled || token !== loadToken) return; tex.needsUpdate = true; if (!shown) { shown = true; if (texture) texture.dispose(); texture = tex; mat.map = tex; mat.color.set(0xffffff); mat.needsUpdate = true; } redraw(); };
      const queue = () => { if (!pendingUpload) pendingUpload = setTimeout(upload, shown ? 600 : 120); };
      let total = 0, done = 0, errors = 0;
      levels.forEach((z) => { total += 2 ** (z + 1) * 2 ** z; });
      const runLevel = (i) => {
        if (i >= levels.length || cancelled || token !== loadToken) return;
        const z = levels[i], cols = 2 ** (z + 1), rows = 2 ** z, s = cv.width / (256 * cols);
        let left = cols * rows;
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.decoding = 'async';
          img.onload = () => { if (cancelled || token !== loadToken) return; ctx.drawImage(img, x * 256 * s, y * 256 * s, 256 * s, 256 * s); done++; setLoadPct(Math.round((100 * done) / total)); queue(); if (--left === 0) runLevel(i + 1); };
          img.onerror = () => { if (cancelled || token !== loadToken) return; errors++; done++; if (--left === 0) runLevel(i + 1); if (errors > 8 && !shown) setFailed('NASA Moon Trek imagery did not load (network). The pins and coordinates still work.'); };
          img.src = `${L.url}/${z}/${y}/${x}.${L.ext}`;
        }
      };
      setLoadPct(0);
      runLevel(0);
    };

    api.current = {
      sites: [], pinVec: {}, customVec: null,
      flyTo, redraw, loadLayer,
      zoom: (f) => { fly = null; view.dist = 1 + (view.dist - 1) * f; redraw(); },
      home: (lat, lon) => flyTo(lat, lon, DIST_HOME),
      rotate: (dLat, dLon) => { fly = null; view.lat += dLat; view.lon += dLon; redraw(); },
      get view() { return view; },
    };
    loadLayer('moonkit');
    redraw();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      lines.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      lineMat.dispose(); terrainMat.dispose(); geo.dispose(); mat.dispose(); capGeo.dispose(); if (capMat.map) capMat.map.dispose(); capMat.dispose();
      if (texture) texture.dispose();
      if (bump) bump.dispose();
      renderer.dispose();
      api.current = null;
    };
  }, []);

  // ---- pins, custom point ----
  useEffect(() => {
    if (!api.current) return;
    api.current.sites = sites;
    api.current.pinVec = Object.fromEntries(sites.map((s) => [s.id, vec(s.lat, s.lon, 1.002)]));
    api.current.customVec = custom ? vec(custom.lat, custom.lon, 1.002) : null;
    api.current.redraw();
  }, [sites, custom && custom.lat, custom && custom.lon]);

  // ---- smooth fly to the selected site (from the dropdown, the polar map, the tables, or a pin) ----
  const target = currentId === 'custom' ? (custom ? [custom.lat, custom.lon] : null) : (() => { const s = sites.find((x) => x.id === currentId); return s ? [s.lat, s.lon] : null; })();
  const firstFly = useRef(true);
  const lastFocus = useRef(focusKey);
  useEffect(() => {
    if (!api.current || !target) return;
    const v = api.current.view;
    if (firstFly.current) { firstFly.current = false; v.lat = target[0]; v.lon = target[1]; api.current.redraw(); return; }
    if (currentId === 'custom' && !(custom && custom.name) && focusKey === lastFocus.current) return; // a clicked spot: don't move the globe under the cursor (named places and list picks do fly)
    const listPick = focusKey !== lastFocus.current;
    lastFocus.current = focusKey;
    // A pick from the site list always brings that exact spot to the centre at a close, site-level zoom, wherever the view was.
    api.current.flyTo(target[0], target[1], listPick ? (Math.abs(target[0]) > 80 ? 1.35 : 2.2) : Math.min(v.dist, DIST_HOME));
  }, [currentId, focusKey, target && target[0], target && target[1]]);

  useEffect(() => { if (api.current) api.current.loadLayer(layer); }, [layer]);

  const onKey = (e) => {
    if (!api.current) return;
    const step = 6 * (api.current.view.dist - 1) / (DIST_HOME - 1);
    const map = { ArrowLeft: [0, -step], ArrowRight: [0, step], ArrowUp: [step, 0], ArrowDown: [-step, 0] };
    if (map[e.key]) { e.preventDefault(); api.current.rotate(...map[e.key]); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); api.current.zoom(0.8); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); api.current.zoom(1.25); }
  };
  const go = (lat, lon) => api.current && api.current.home(lat, lon);
  const cur = sites.find((x) => x.id === currentId);

  return (
    <div className="globe-wrap">
      <div className="globe-box" ref={boxRef}>
        <canvas ref={canvasRef} className="globe-canvas" tabIndex={0} onKeyDown={onKey}
          role="img" aria-label="3D Moon. Drag or use the arrow keys to turn it, scroll, pinch or use + and − to zoom, click to pick a point." />
        <div className="globe-pins" aria-hidden={false}>
          {sites.map((s) => {
            const sel = s.id === currentId, st = statusById[s.id];
            return (
              <button key={s.id} ref={(el) => { pinRefs.current[s.id] = el; }} className={`gpin ${sel ? 'sel' : ''}`}
                style={{ '--pin': COLOR[st] || '#ffffff', visibility: 'hidden' }}
                onClick={() => onPick(s.id)} onMouseEnter={() => setHoverId(s.id)} onMouseLeave={() => setHoverId(null)}
                onFocus={() => setHoverId(s.id)} onBlur={() => setHoverId(null)}
                aria-label={`${s.name}${st ? `: ${st}` : ''}`} title={`${s.name}${st ? `: ${st}` : ''}`}>
                <i />
                {(sel || hoverId === s.id) && <span>{short(s.name)}{sel && currentStatus ? <em className={`gbadge ${currentStatus === 'GO' ? 'go' : currentStatus === 'CAUTION' ? 'caution' : 'nogo'}`}>{currentStatus}</em> : st ? ` · ${st}` : ''}</span>}
              </button>
            );
          })}
          {custom && <div ref={customRef} className="gpin gcustom" style={{ visibility: 'hidden' }}><b /><span>{custom.name || 'Your point'}{currentStatus && <em className={`gbadge ${currentStatus === 'GO' ? 'go' : currentStatus === 'CAUTION' ? 'caution' : 'nogo'}`}>{currentStatus}</em>}</span></div>}
        </div>
        <div className="globe-tools">
          {lead}
          <div className="layers">
            <button className="layers-btn" aria-expanded={layersOpen} aria-haspopup="true" onClick={() => setLayersOpen((x) => !x)} title="Map imagery">
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 8.5 12 14l10-5.5L12 3Z M2 13l10 5.5L22 13 M2 17.5 12 23l10-5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
              <span>{LAYERS[layer].label}</span>
            </button>
            {layersOpen && <div className="layers-menu" role="menu">
              {Object.entries(LAYERS).map(([k, v]) => <button key={k} role="menuitemradio" aria-checked={layer === k} className={layer === k ? 'on' : ''} onClick={() => { setLayer(k); setLayersOpen(false); }}>{v.label}</button>)}
            </div>}
          </div>
        </div>
        <div className="globe-nav" role="group" aria-label="Map navigation">
          <button onClick={() => go(-89, api.current ? api.current.view.lon : 0)} title="Look straight at the south pole">South pole</button>
          {(cur || custom) && <button onClick={() => { const t = cur || custom; api.current && api.current.flyTo(t.lat, t.lon, Math.abs(t.lat) > 80 ? 1.35 : 2.2); }} title="Fly back to the selected site">Selected site</button>}
          <div className="zoom-v">
            <button onClick={() => api.current && api.current.zoom(0.75)} aria-label="Zoom in" title="Zoom in">+</button>
            <button onClick={() => api.current && api.current.zoom(1.33)} aria-label="Zoom out" title="Zoom out">−</button>
          </div>
        </div>
        {loadPct > 0 && loadPct < 100 && <div className="globe-load" aria-hidden="true"><div style={{ width: `${loadPct}%` }} /></div>}
        {failed && <p className="globe-fail">{failed}</p>}
      </div>
      <div className="statusbar">
        <span><b>LAT / LON</b> <span ref={readoutRef}>--</span></span>
        <span className="legend"><i style={{ background: COLOR.GO }} />GO <i style={{ background: COLOR.CAUTION }} />CAUTION <i style={{ background: COLOR['NO-GO'] }} />NO-GO <i className="ring80" />NASA terrain</span>
      </div>
      <p className="hint small">Drag to rotate · scroll to zoom · click a pin or any point to select it. Inside the dashed 80° S ring: NASA LOLA terrain; outside: smooth Moon.</p>
      <p className="hint tiny">Imagery: {LAYERS[layer].credit}{LAYERS[layer].kit ? '' : ', via NASA Solar System Treks (Moon Trek)'}. South of 80°S: NASA LRO LOLA 80–90°S relief (Barker et al. 2023), same as the South pole map. 3D: three.js.</p>
    </div>
  );
}
