import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { useTheme } from '../lib/theme.jsx';
import { MALAYSIA_BOUNDS } from '../lib/geo.js';

function FitBounds({ bounds }) {
  const map = useMap();
  const key = JSON.stringify(bounds);
  useEffect(() => {
    // No animation: a zoom still running when the tab unmounts throws in Leaflet.
    if (key) map.fitBounds(JSON.parse(key), { padding: [12, 12], animate: false });
  }, [map, key]);
  return null;
}

// Leaflet measures its container once; when the layout reflows (tab switch,
// resize) it must be told, or tiles render grey.
function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
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
        <InvalidateOnResize />
        {children}
      </MapContainer>
    </div>
  );
}
