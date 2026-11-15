import React, { useEffect, useRef, useState } from 'react';
import { fmtShortUTC, HOUR } from '../format.js';

// QuickMap-style time bar fixed to the bottom of the screen: scrub or play through the mission.
const SPEEDS = [{ k: '1 h/s', h: 1 }, { k: '6 h/s', h: 6 }, { k: '1 d/s', h: 24 }];

export default function TimeBar({ t0, t1, value, onChange, site }) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const ref = useRef(value);
  ref.current = value ?? t0;
  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      let next = ref.current + SPEEDS[speed].h * HOUR * 0.05;
      if (next > t1) next = t0;
      onChange(next);
    }, 50);
    return () => clearInterval(id);
  }, [playing, speed, t0, t1]);
  const v = value ?? t0;
  return (
    <div className="timebar" role="group" aria-label="Mission time">
      <button className="tb-btn" onClick={() => onChange(t0)} title="Back to landing">⏮</button>
      <button className="tb-btn play" onClick={() => setPlaying((p) => !p)} title={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
      <button className="tb-btn" onClick={() => setSpeed((k) => (k + 1) % SPEEDS.length)} title="Playback speed">{SPEEDS[speed].k}</button>
      <input type="range" min={t0} max={t1} step={HOUR} value={v} onChange={(e) => { setPlaying(false); onChange(+e.target.value); }} aria-label="Time in mission" />
      <span className="tb-time"><b>{fmtShortUTC(v)}</b> UTC</span>
      {site && <span className="tb-site muted">{site.name}</span>}
    </div>
  );
}
