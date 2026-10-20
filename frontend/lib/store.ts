import type { Map as LeafletMap } from 'leaflet';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_FILTERS, DEMO_AGENTS } from './constants';
import { parseUrlState } from './urlState';
import type { BBox, Filters, SortKey } from './types';

export type DrawerTab = 'details' | 'queue';
export type SheetSnap = 'peek' | 'half' | 'full';

interface MapView {
  center: { lat: number; lng: number };
  zoom: number;
  bbox: BBox;
}

export interface UiState {
  // persisted per browser
  agentId: string;
  theme: 'light' | 'dark';
  searchAsMove: boolean;
  leftCollapsed: boolean;

  // shareable (mirrored to URL)
  filters: Filters;
  sort: SortKey;
  selectedId: number | null;

  // live map
  view: MapView | null;
  /** The bbox the current results are for. Lags `view` when "search as I move" is off. */
  searchBbox: BBox | null;
  map: LeafletMap | null;

  // transient UI
  hovered: { id: number; source: 'list' | 'map' } | null;
  drawer: DrawerTab | null;
  showQueueRoute: boolean;
  paletteOpen: boolean;
  helpOpen: boolean;
  sheet: SheetSnap;

  setFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;
  setSort: (sort: SortKey) => void;
  setView: (view: MapView) => void;
  searchThisArea: () => void;
  setSearchAsMove: (on: boolean) => void;
  select: (id: number | null, opts?: { fly?: { lat: number; lng: number } }) => void;
  setHovered: (h: UiState['hovered']) => void;
  openDrawer: (tab: DrawerTab) => void;
  closeDrawer: () => void;
  toggleQueueRoute: () => void;
  setAgent: (agentId: string) => void;
  toggleTheme: () => void;
  toggleLeft: () => void;
  setMap: (map: LeafletMap | null) => void;
  setPaletteOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setSheet: (snap: SheetSnap) => void;
}

const fromUrl = typeof window !== 'undefined' ? parseUrlState(window.location.search) : null;

export const initialMapView = {
  center: fromUrl?.center ?? null,
  zoom: fromUrl?.zoom ?? null,
};

export const useUi = create<UiState>()(
  persist(
    (set, get) => ({
      agentId: DEMO_AGENTS[0].id,
      theme: typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      searchAsMove: true,
      leftCollapsed: false,

      filters: fromUrl?.filters ?? DEFAULT_FILTERS,
      sort: fromUrl?.sort ?? 'score',
      selectedId: fromUrl?.selectedId ?? null,

      view: null,
      searchBbox: null,
      map: null,

      hovered: null,
      drawer: fromUrl?.selectedId ? 'details' : null,
      showQueueRoute: false,
      paletteOpen: false,
      helpOpen: false,
      sheet: 'half',

      setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
      resetFilters: () => set({ filters: DEFAULT_FILTERS }),
      setSort: (sort) => set({ sort }),
      setView: (view) =>
        set((s) => ({ view, searchBbox: s.searchAsMove || !s.searchBbox ? view.bbox : s.searchBbox })),
      searchThisArea: () => set((s) => ({ searchBbox: s.view?.bbox ?? s.searchBbox })),
      setSearchAsMove: (on) => set((s) => ({ searchAsMove: on, searchBbox: on ? s.view?.bbox ?? s.searchBbox : s.searchBbox })),
      select: (id, opts) => {
        set((s) => ({
          selectedId: id,
          drawer: id === null ? (s.drawer === 'details' ? null : s.drawer) : 'details',
          sheet: id !== null && s.sheet === 'peek' ? 'half' : s.sheet,
        }));
        const map = get().map;
        if (id !== null && opts?.fly && map) {
          map.flyTo([opts.fly.lat, opts.fly.lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
        }
      },
      setHovered: (hovered) => set({ hovered }),
      openDrawer: (tab) => set({ drawer: tab, sheet: 'half' }),
      closeDrawer: () => set({ drawer: null, selectedId: null }),
      toggleQueueRoute: () => set((s) => ({ showQueueRoute: !s.showQueueRoute })),
      setAgent: (agentId) => set({ agentId, selectedId: null, drawer: null, hovered: null }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
      toggleLeft: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
      setMap: (map) => set({ map }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      setHelpOpen: (helpOpen) => set({ helpOpen }),
      setSheet: (sheet) => set({ sheet }),
    }),
    {
      name: 'prospect-map-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ agentId: s.agentId, theme: s.theme, searchAsMove: s.searchAsMove, leftCollapsed: s.leftCollapsed }),
    },
  ),
);

export const currentAgent = (agentId: string) => DEMO_AGENTS.find((a) => a.id === agentId) ?? DEMO_AGENTS[0];
