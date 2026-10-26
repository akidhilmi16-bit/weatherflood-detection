export const DEPTH_CLASSES = [
  { key: 'shallow', label: 'Shallow (< 70 km)', max: 70 },
  { key: 'intermediate', label: 'Intermediate (70–300 km)', max: 300 },
  { key: 'deep', label: 'Deep (> 300 km)', max: Infinity },
];

export const depthClass = (depth) => DEPTH_CLASSES.findIndex((c) => depth < c.max);

/** "3,301km NE Pulau Banggi,SABAH" -> 3301 */
export function distanceKm(s) {
  const m = /([\d,.]+)\s*km/i.exec(s ?? '');
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

export function enrichQuakes(rows) {
  return rows
    .filter((q) => q.visible !== false && q.lat != null && q.lon != null)
    .map((q) => ({
      ...q,
      time: new Date(`${q.utcdatetime}Z`),
      distMy: distanceKm(q.n_distancemas),
      depthIdx: depthClass(q.depth ?? 0),
    }));
}

/** Marker radius in px, area roughly proportional to released energy band */
export const quakeRadius = (mag) => Math.max(4, Math.pow(1.6, (mag ?? 3) - 1.5));
