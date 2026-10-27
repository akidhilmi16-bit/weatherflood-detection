import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { useTheme } from '../lib/theme.jsx';
import { MALAYSIA_BOUNDS } from '../lib/geo.js';

// Leaflet measures its container once; when the layout reflows (tab switch,
// resize) it must be told, or tiles render grey. Until the user pans or zooms,
// each reflow also re-fits the bounds so the map stays framed.
function FitBounds({ bounds }) {
  const map = useMap();
  const key = JSON.stringify(bounds);
  useEffect(() => {
    if (!key) return undefined;
    // No animation: a zoom still running when the tab unmounts throws in Leaflet.
    const fit = () => map.fitBounds(JSON.parse(key), { padding: [12, 12], animate: false });
    fit();
    let touched = false;
    const el = map.getContainer();
    const touch = () => (touched = true);
    const events = ['mousedown', 'wheel', 'touchstart', 'keydown'];
    events.forEach((e) => el.addEventListener(e, touch, { passive: true }));
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      if (!touched) fit();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      events.forEach((e) => el.removeEventListener(e, touch));
    };
  }, [map, key]);
  return null;
}

export default function BaseMap({ bounds = MALAYSIA_BOUNDS, minZoom = 4, children, className = '' }) {
  const { theme } = useTheme();
  return (
    <div className={`map-wrap ${className}`}>
      <MapContainer
        bounds={bounds}
        minZoom={minZoom}
        maxZoom={11}
        zoomSnap={0.25}
        scrollWheelZoom
        worldCopyJump
        attributionControl={false}
        style={{ height: '100%', width: '100%', background: theme.page }}
      >
        <TileLayer key={theme.mode} url={theme.tiles} maxNativeZoom={16} />
        <FitBounds bounds={bounds} />
        {children}
      </MapContainer>
    </div>
  );
}
