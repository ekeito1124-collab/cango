import { useEffect, useRef, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Link } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import { useApp } from '../context.jsx';

const COLORS = { OK: '#2f8f4e', LIMITED: '#c98a12', FULL: '#8a8a8a', NONE: '#8a5cc2', UNKNOWN: '#8a8a8a' };

// 一度取得した現在地は画面をまたいで使い回す
let lastPosition = null;

function FitBounds({ points }) {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join('|');
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length > 1) map.fitBounds(points, { padding: [30, 30], maxZoom: 16 });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// 地図右上の「現在地に戻る」ボタン。現在地を青い点で表示し、そこへ移動する
function LocateControl() {
  const map = useMap();
  const { t } = useApp();
  const ref = useRef(null);
  const [pos, setPos] = useState(lastPosition);
  const [state, setState] = useState('idle'); // idle | loading | error

  useEffect(() => {
    // ボタン操作が地図のドラッグ・クリックとして扱われないようにする
    if (ref.current) {
      L.DomEvent.disableClickPropagation(ref.current);
      L.DomEvent.disableScrollPropagation(ref.current);
    }
  }, []);

  const locate = () => {
    if (!navigator.geolocation) {
      setState('error');
      return;
    }
    setState('loading');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        lastPosition = next;
        setPos(next);
        setState('idle');
        map.flyTo([next.lat, next.lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
      },
      () => setState('error'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  return (
    <>
      {pos && (
        <>
          <Circle center={[pos.lat, pos.lng]} radius={Math.min(pos.accuracy || 0, 300)} pathOptions={{ color: '#2b7de9', weight: 1, fillOpacity: 0.12 }} />
          <CircleMarker center={[pos.lat, pos.lng]} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#2b7de9', fillOpacity: 1 }}>
            <Popup>{t('map.you')}</Popup>
          </CircleMarker>
        </>
      )}
      <div ref={ref} className="map-overlay">
        <button type="button" className={'locate-btn' + (state === 'loading' ? ' busy' : '')} onClick={locate} aria-label={t('map.locate')} title={t('map.locate')}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" fill="currentColor" />
            <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        {state === 'error' && (
          <p className="map-toast" role="status">
            {t('map.locateFailed')}
          </p>
        )}
      </div>
    </>
  );
}

export default function ShopMap({ shops, center, height = 320, single = false }) {
  const { t, lang } = useApp();
  const points = shops.map((s) => [s.lat, s.lng]);
  const start = points[0] || (center ? [center.lat, center.lng] : [34.8892, 135.8077]);
  return (
    <>
      <div className="map-wrap" style={{ height }}>
        <MapContainer center={start} zoom={14} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBounds points={points} />
        <LocateControl />
        {shops.map((s) => {
          const status = s.reservationMethod === 'NONE' ? 'NONE' : s.availability ? (s.availability.deadlinePassed ? 'FULL' : s.availability.status) : 'UNKNOWN';
          return (
            <CircleMarker key={s.slug} center={[s.lat, s.lng]} radius={11} pathOptions={{ color: '#fff', weight: 2.5, fillColor: COLORS[status], fillOpacity: 0.95 }}>
              <Popup>
                <strong>{s.name}</strong>
                {s.nameRomaji && <div>{s.nameRomaji}</div>}
                <div>{t('cat.' + s.category)}</div>
                {!single && <Link to={`/${lang}/shops/${s.slug}`}>→ {t('shop.about')}</Link>}
                <div>
                  <a href={s.mapsUrl} target="_blank" rel="noreferrer">
                    {t('shop.openMaps')}
                  </a>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
        </MapContainer>
      </div>
      {!single && (
        <ul className="map-legend" aria-label={t('map.legend')}>
          <li>
            <i style={{ background: COLORS.OK }} />○ {t('avail.OK')}
          </li>
          <li>
            <i style={{ background: COLORS.LIMITED }} />△ {t('avail.LIMITED')}
          </li>
          <li>
            <i style={{ background: COLORS.FULL }} />✕ {t('avail.FULL')}
          </li>
          <li>
            <i style={{ background: COLORS.NONE }} />
            {t('method.NONE')}
          </li>
        </ul>
      )}
    </>
  );
}
