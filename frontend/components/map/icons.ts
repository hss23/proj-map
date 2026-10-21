import L from 'leaflet';
import { Lock, type LucideIcon, Star } from 'lucide-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CLAIMED_COLOR, INDUSTRY_ICONS, TIER_META, industryIcon, tierOf } from '@/lib/constants';
import type { BusinessSummary } from '@/lib/types';

// Pre-render lucide icons to SVG strings once; divIcons need raw HTML.
const svg = (Icon: LucideIcon) =>
  renderToStaticMarkup(createElement(Icon, { strokeWidth: 2.25, 'aria-hidden': true }));
const INDUSTRY_SVG = new Map(Object.keys(INDUSTRY_ICONS).map((k) => [k, svg(industryIcon(k))]));
const STAR_SVG = renderToStaticMarkup(createElement(Star, { fill: 'currentColor', strokeWidth: 0, width: 11, height: 11 }));
const LOCK_SVG = renderToStaticMarkup(createElement(Lock, { strokeWidth: 2.5 }));

const TAG_BOX: [number, number] = [76, 36];
const pinCache = new Map<string, L.DivIcon>();

/**
 * Score-tag pill (like a price tag on a property map): industry glyph + lead score.
 * Tier colour tints the glyph; ★ = in my queue; grey + lock = claimed by another agent.
 * The tag's tip is the anchor, so it points exactly at the business.
 */
export function pinIcon(b: BusinessSummary, selected: boolean, hovered: boolean): L.DivIcon {
  const claimed = b.claim.status === 'other';
  const mine = b.claim.status === 'mine';
  const color = claimed ? CLAIMED_COLOR : TIER_META[tierOf(b.leadScore)].color;
  const key = `${b.industry}|${b.leadScore}|${b.claim.status}|${selected}|${hovered}`;
  let icon = pinCache.get(key);
  if (!icon) {
    const glyph = claimed ? LOCK_SVG : (INDUSTRY_SVG.get(b.industry) ?? '');
    const cls = ['biz-pin', selected && 'is-selected', hovered && 'is-hovered', claimed && 'is-claimed', mine && 'is-mine']
      .filter(Boolean)
      .join(' ');
    icon = L.divIcon({
      className: cls,
      html: `<div class="tag" style="--c:${color}"><span class="ico">${glyph}</span>${b.leadScore}${mine ? `<span class="star">${STAR_SVG}</span>` : ''}</div>`,
      iconSize: TAG_BOX,
      iconAnchor: [TAG_BOX[0] / 2, TAG_BOX[1]],
      tooltipAnchor: [0, -TAG_BOX[1]],
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
