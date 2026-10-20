import L from 'leaflet';
import { Lock, type LucideIcon, Star } from 'lucide-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CLAIMED_COLOR, INDUSTRY_ICONS, MINE_COLOR, TIER_META, industryIcon, tierOf } from '@/lib/constants';
import type { BusinessSummary } from '@/lib/types';

// Pre-render lucide icons to SVG strings once; divIcons need raw HTML.
const svg = (Icon: LucideIcon) =>
  renderToStaticMarkup(createElement(Icon, { strokeWidth: 2.25, 'aria-hidden': true }));
const INDUSTRY_SVG = new Map(Object.keys(INDUSTRY_ICONS).map((k) => [k, svg(industryIcon(k))]));
const STAR_SVG = renderToStaticMarkup(createElement(Star, { fill: 'currentColor', strokeWidth: 0 }));
const LOCK_SVG = renderToStaticMarkup(createElement(Lock, { strokeWidth: 3 }));

const PIN_SIZE = 30;
const pinCache = new Map<string, L.DivIcon>();

/** Score-tier colour + industry glyph; star badge = mine, lock badge + grey = claimed by someone else. */
export function pinIcon(b: BusinessSummary, selected: boolean, hovered: boolean): L.DivIcon {
  const claimed = b.claim.status === 'other';
  const mine = b.claim.status === 'mine';
  const color = claimed ? CLAIMED_COLOR : TIER_META[tierOf(b.leadScore)].color;
  const key = `${b.industry}|${color}|${b.claim.status}|${selected}|${hovered}`;
  let icon = pinCache.get(key);
  if (!icon) {
    const badge = mine
      ? `<span class="badge" style="background:${MINE_COLOR}">${STAR_SVG}</span>`
      : claimed
        ? `<span class="badge" style="background:#4b5563">${LOCK_SVG}</span>`
        : '';
    icon = L.divIcon({
      className: `biz-pin${selected ? ' is-selected' : ''}${hovered ? ' is-hovered' : ''}`,
      html: `<div class="pin" style="background:${color}">${INDUSTRY_SVG.get(b.industry) ?? ''}${badge}</div>`,
      iconSize: [PIN_SIZE, PIN_SIZE],
      iconAnchor: [PIN_SIZE / 2, PIN_SIZE / 2],
      tooltipAnchor: [0, -PIN_SIZE / 2],
    });
    pinCache.set(key, icon);
  }
  return icon;
}

/**
 * Cluster bubble: size grows with count; colour reflects the share of *actionable*
 * hot leads inside (claimed-by-others don't count), and a green badge shows how
 * many hot leads are hiding in there, which tells the agent where to zoom.
 */
export function clusterIcon(businesses: Array<BusinessSummary | undefined>): L.DivIcon {
  const count = businesses.length;
  const actionable = businesses.filter((b): b is BusinessSummary => !!b && b.claim.status !== 'other');
  const hot = actionable.filter((b) => b.leadScore >= 75).length;
  const avg = actionable.length ? actionable.reduce((s, b) => s + b.leadScore, 0) / actionable.length : 0;
  const tier = hot / Math.max(count, 1) >= 0.2 ? 'hot' : avg >= 50 ? 'warm' : 'cool';
  const size = count < 10 ? 38 : count < 30 ? 44 : count < 80 ? 52 : 60;
  const hotBadge = hot
    ? `<span class="hot" title="${hot} hot lead${hot > 1 ? 's' : ''}">${hot}</span>`
    : '';
  return L.divIcon({
    className: 'biz-cluster',
    html: `<div class="bubble" style="--c:${TIER_META[tier].color}" aria-label="${count} businesses, ${hot} hot">${count}${hotBadge}</div>`,
    iconSize: L.point(size, size),
  });
}

export function queueStopIcon(n: number): L.DivIcon {
  return L.divIcon({ className: 'queue-stop', html: `<div>${n}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] });
}
