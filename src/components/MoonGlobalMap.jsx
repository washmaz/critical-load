import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Global Moon map: NASA Solar System Treks (Moon Trek) WMTS tiles, LRO WAC Global Mosaic 303 ppd v02
// (NASA LRO LROC, Arizona State University). Equirectangular (plate carrée) tiles: 2 x 1 tiles at zoom 0,
// which matches Leaflet's L.CRS.EPSG4326, so Leaflet's {z}/{y}/{x} maps straight onto Moon Trek's
// {TileMatrix}/{TileRow}/{TileCol}. The polar map stays the detailed view for sites south of 80°S.
const WAC_URL =
  'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg';
const BOUNDS = [[-90, -180], [90, 180]];
const toLeafletLon = (lon) => (lon > 180 ? lon - 360 : lon); // sites.js is already −180…180 °E; kept for safety

const COLOR = { GO: '#47da84', CAUTION: '#ffb020', 'NO-GO': '#ff5c52' }; // same as the polar map

export default function MoonGlobalMap({ sites, currentId, onPick, statusById = {} }) {
  const divRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    const map = L.map(divRef.current, {
      crs: L.CRS.EPSG4326, // plain lat/lon, not Web Mercator (Mercator can't show the poles)
      center: [0, 0],
      zoom: 0,
      minZoom: -1.5,
      zoomSnap: 0.25,
      maxZoom: 9,
      maxBounds: BOUNDS,
      maxBoundsViscosity: 1.0,
      worldCopyJump: false,
      attributionControl: true,
      scrollWheelZoom: false, // the page scrolls past the map; zoom with the +/- buttons or a double-click
    });
    L.tileLayer(WAC_URL, {
      tileSize: 256,
      maxNativeZoom: 8,
      noWrap: true,
      bounds: BOUNDS,
      attribution: 'LRO WAC Global Mosaic · NASA Solar System Treks (Moon Trek) · NASA LRO LROC / ASU',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // The panel starts collapsed (size 0); re-measure whenever it opens or the window resizes,
    // and fit the whole Moon so every site (south-pole pins included) is in view and clickable.
    const fit = () => { map.invalidateSize(); if (divRef.current && divRef.current.clientWidth > 0) map.fitBounds(BOUNDS, { padding: [6, 6] }); };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(divRef.current);
    return () => { if (ro) ro.disconnect(); map.remove(); mapRef.current = null; layerRef.current = null; };
  }, []);

  useEffect(() => {
    const group = layerRef.current;
    if (!group) return;
    group.clearLayers();
    sites.forEach((s) => {
      const sel = s.id === currentId;
      L.circleMarker([s.lat, toLeafletLon(s.lon)], {
        radius: sel ? 8 : 5.5,
        weight: sel ? 3 : 2,
        color: sel ? '#ffffff' : '#000',
        fillColor: COLOR[statusById[s.id]] || '#ffffff',
        fillOpacity: 1,
      })
        .bindTooltip(statusById[s.id] ? `${s.name}: ${statusById[s.id]}` : s.name)
        .on('click', () => pickRef.current && pickRef.current(s.id))
        .addTo(group);
    });
  }, [sites, currentId, statusById]);

  return <div ref={divRef} className="moon-global-map" role="region" aria-label="Global Moon map with all landing sites" />;
}
