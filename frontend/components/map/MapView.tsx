/// <reference types="leaflet.markercluster" />
'use client';

import L from 'leaflet';
import { memo, useEffect, useMemo, useRef } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import { ClaimBadge, ScorePill } from '@/components/badges';
import { DEFAULT_ZOOM, MIN_ZOOM, VANCOUVER } from '@/lib/constants';
import { useBusinessSearch, useQueue } from '@/lib/queries';
import { currentAgent, initialMapView, useUi } from '@/lib/store';
import type { BBox, BusinessSummary } from '@/lib/types';
import { debounce, formatDistance } from '@/lib/utils';
import { clusterIcon, pinIcon, queueStopIcon } from './icons';

/** Must match the backend's MAX_BBOX_SPAN; larger views are clamped around the centre. */
const MAX_SPAN = { lng: 3, lat: 2 };

export function clampBbox(b: BBox, center: { lat: number; lng: number }): BBox {
  const halfLng = Math.min(b.maxLng - b.minLng, MAX_SPAN.lng) / 2;
  const halfLat = Math.min(b.maxLat - b.minLat, MAX_SPAN.lat) / 2;
  return {
    minLng: Math.max(-180, center.lng - halfLng),
    maxLng: Math.min(180, center.lng + halfLng),
    minLat: Math.max(-90, center.lat - halfLat),
    maxLat: Math.min(90, center.lat + halfLat),
  };
}

// OpenStreetMap standard tiles: no API key. Dark mode is a CSS filter on the tile pane (see globals.css).
// Production would use a commercial/vector tile provider with an SLA.
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Lookup used by cluster icons, which only get Leaflet markers (we stash the business id on each). */
const businessById = new Map<number, BusinessSummary>();

export default function MapView() {
  const agentId = useUi((s) => s.agentId);
  const setMap = useUi((s) => s.setMap);

  const start = useMemo(() => {
    const home = currentAgent(agentId).home;
    return { center: initialMapView.center ?? (agentId === 'agent-alex' ? VANCOUVER : home), zoom: initialMapView.zoom ?? DEFAULT_ZOOM };
    // Only the initial agent matters; switching agents later flies the map instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <MapContainer
      ref={setMap}
      center={[start.center.lat, start.center.lng]}
      zoom={start.zoom}
      minZoom={MIN_ZOOM}
      maxZoom={19}
      zoomControl={false}
      className="h-full w-full"
      worldCopyJump={false}
      attributionControl
    >
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} maxZoom={19} />
      <ViewSync />
      <MapStyleSync />
      <BusinessLayer />
      <SelectedRing />
      <HoverHalo />
      <QueueRoute />
    </MapContainer>
  );
}

/** Pushes the visible area into the store (debounced) so the search follows the map. */
function ViewSync() {
  const setView = useUi((s) => s.setView);
  const map = useMap();
  const push = useMemo(
    () =>
      debounce(() => {
        // A hidden container (background tab, collapsed pane) measures 0×0 and would yield a
        // zero-area bbox the API rejects. Wait: the 'resize' event fires once it has a size.
        const size = map.getSize();
        if (size.x === 0 || size.y === 0) return;
        const b = map.getBounds();
        const c = map.getCenter();
        const center = { lat: c.lat, lng: c.lng };
        setView({
          center,
          zoom: map.getZoom(),
          bbox: clampBbox({ minLng: b.getWest(), minLat: b.getSouth(), maxLng: b.getEast(), maxLat: b.getNorth() }, center),
        });
      }, 250),
    [map, setView],
  );
  useMapEvents({ moveend: push, resize: push });
  useEffect(() => {
    push();
    return () => push.cancel();
  }, [push]);
  return null;
}

function BusinessLayer() {
  const { data } = useBusinessSearch();
  const selectedId = useUi((s) => s.selectedId);
  const hovered = useUi((s) => s.hovered);
  const items = useMemo(() => data?.items ?? [], [data]);
  for (const b of items) businessById.set(b.id, b);

  const iconCreateFunction = useMemo(
    () => (cluster: L.MarkerCluster) =>
      clusterIcon(cluster.getAllChildMarkers().map((m) => businessById.get((m.options as { bizId?: number }).bizId ?? -1))),
    [],
  );

  return (
    <MarkerClusterGroup
      chunkedLoading
      showCoverageOnHover={false}
      spiderfyOnMaxZoom
      maxClusterRadius={(zoom: number) => (zoom >= 16 ? 30 : 55)}
      disableClusteringAtZoom={18}
      iconCreateFunction={iconCreateFunction}
    >
      {items.map((b) => (
        <BusinessMarker key={b.id} b={b} selected={b.id === selectedId} hovered={hovered?.id === b.id} />
      ))}
    </MarkerClusterGroup>
  );
}

const BusinessMarker = memo(function BusinessMarker({ b, selected, hovered }: { b: BusinessSummary; selected: boolean; hovered: boolean }) {
  const select = useUi((s) => s.select);
  const setHovered = useUi((s) => s.setHovered);
  const icon = useMemo(() => pinIcon(b, selected, hovered), [b, selected, hovered]);
  const handlers = useMemo(
    () => ({
      click: () => select(b.id),
      mouseover: () => setHovered({ id: b.id, source: 'map' }),
      mouseout: () => setHovered(null),
      keypress: (e: L.LeafletKeyboardEvent) => {
        if (e.originalEvent.key === 'Enter') select(b.id);
      },
    }),
    [b.id, select, setHovered],
  );
  // Extra option read back by the cluster icon function.
  const extra = { bizId: b.id } as object;
  return (
    <Marker
      position={[b.lat, b.lng]}
      icon={icon}
      eventHandlers={handlers}
      zIndexOffset={selected ? 1000 : hovered ? 500 : 0}
      title={b.name}
      alt={`${b.name}, lead score ${b.leadScore}`}
      {...extra}
    >
      <Tooltip direction="top" className="biz-tooltip" opacity={1} offset={[0, -4]}>
        <MiniCard b={b} />
      </Tooltip>
    </Marker>
  );
});

function MiniCard({ b }: { b: BusinessSummary }) {
  return (
    <div className="w-56 p-3 font-sans">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{b.name}</div>
          <div className="truncate text-xs text-muted">
            {b.subCategory}
            {b.distanceKm !== undefined && ` · ${formatDistance(b.distanceKm)}`}
          </div>
        </div>
        <ScorePill score={b.leadScore} />
      </div>
      {b.claim.status !== 'unclaimed' && (
        <div className="mt-2">
          <ClaimBadge claim={b.claim} />
        </div>
      )}
      <div className="mt-2 text-[11px] text-muted">Click for details</div>
    </div>
  );
}

/** Pulsing ring at the business hovered in the list, visible even when its pin is inside a cluster. */
function HoverHalo() {
  const hovered = useUi((s) => s.hovered);
  const { data } = useBusinessSearch();
  if (!hovered || hovered.source !== 'list') return null;
  const b = data?.items.find((x) => x.id === hovered.id);
  if (!b) return null;
  return (
    <CircleMarker
      center={[b.lat, b.lng]}
      radius={22}
      interactive={false}
      // className must be a creation option: react-leaflet applies pathOptions via setStyle(), which ignores it.
      className="hover-halo"
      pathOptions={{ color: '#7c4dbd', weight: 3, fillColor: '#7c4dbd', fillOpacity: 0.15 }}
    />
  );
}

/** Persistent ring around the selected business, so it stays findable even when its pin is clustered. */
function SelectedRing() {
  const selectedId = useUi((s) => s.selectedId);
  const { data } = useBusinessSearch();
  const b = selectedId === null ? undefined : data?.items.find((x) => x.id === selectedId);
  if (!b) return null;
  return (
    <CircleMarker
      center={[b.lat, b.lng]}
      radius={26}
      interactive={false}
      className="selected-ring"
      pathOptions={{ color: '#4b286d', weight: 3, dashArray: '4 5', fillOpacity: 0 }}
    />
  );
}

/** Applies the muted (greyscale) / colour basemap preference to the map container. */
function MapStyleSync() {
  const map = useMap();
  const mapStyle = useUi((s) => s.mapStyle);
  useEffect(() => {
    map.getContainer().classList.toggle('map-muted', mapStyle === 'muted');
  }, [map, mapStyle]);
  return null;
}

/** "Plan my day": queue stops numbered in priority order, joined by a dashed line. */
function QueueRoute() {
  const show = useUi((s) => s.showQueueRoute);
  const select = useUi((s) => s.select);
  const { data: queue } = useQueue();
  const map = useMap();
  const fitted = useRef(false);

  const points = useMemo(() => (queue ?? []).map((i) => [i.business.lat, i.business.lng] as [number, number]), [queue]);

  useEffect(() => {
    if (show && points.length && !fitted.current) {
      map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 15 });
      fitted.current = true;
    }
    if (!show) fitted.current = false;
  }, [show, points, map]);

  if (!show || !queue?.length) return null;
  return (
    <>
      <Polyline positions={points} pathOptions={{ color: '#7c4dbd', weight: 3, dashArray: '6 8', opacity: 0.85 }} />
      {queue.map((item, i) => (
        <Marker
          key={item.businessId}
          position={[item.business.lat, item.business.lng]}
          icon={queueStopIcon(i + 1)}
          zIndexOffset={2000}
          eventHandlers={{ click: () => select(item.businessId) }}
        >
          <Tooltip direction="right" offset={[12, 0]}>
            {i + 1}. {item.business.name}
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}
