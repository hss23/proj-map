# Design notes: Prospect Map Search

## Main UX decisions

- **Map and list are one view.** The list is the same result set as the map, sorted (score / distance / renewal / name). Hover sync works both ways: hovering a card pulses a halo on the map even when the pin is inside a cluster, and hovering a pin scrolls to its card. Markers alone are hard to compare, and a list alone loses geography.
- **Readable density.** Pins are clustered, and clusters are coloured by their share of _actionable_ hot leads with a badge counting them. Agents zoom where the opportunity is, not where the business count is high. Pins spiderfy at max zoom.
- **Explainable lead score.** A simple rule-based score (size, TELUS status, competitor renewal window, contact recency, industry fit). Every point is shown in a **score breakdown** (starting score + points per factor = score), reachable from any card's score as well as the drawer, because a score an agent can't explain is a score they won't trust. The breakdown is computed as of the score's `scored_at`, so it always matches the number on the card. The competitor **contract end date** is the most actionable signal, so it gets a badge, a filter and a sort.
- **Claims are visible before you click.** Grey lock pins and "Claimed by Priya" badges stop agents from researching leads they can't take. The add action is disabled with a reason, not hidden.
- **Fast, forgiving queue.** Optimistic add/remove/reorder/priority with rollback, _Undo_ on remove (restores the position), drag or keyboard reordering, notes, and "show my queue as a numbered route" for planning visits.
- **Shareable, resumable state.** Filters, viewport and the selected business live in the URL. Presets cover the four most common intents in one click.
- **Keyboard and mobile.** A command palette jumps to any business, and J/K/A/Q shortcuts help desk-based callers. Field agents on a phone get a full-screen map with a draggable bottom sheet. WCAG basics: focus rings, ARIA live result count, colour always paired with an icon or label, and reduced-motion support.

## Trade-offs

- **SQLite + R\*Tree + FTS5** gives a real spatial index and keyword search with zero infrastructure. The cost is single-writer concurrency, which is fine for a prototype but not for a sales floor.
- **Client-side clustering over ≤ 300 returned points** keeps the API simple. Results are capped and the UI says "showing top 300 of N, zoom in".
- **One global `UNIQUE(business_id)` on `queue_items`** is the claim lock. It's simple and race-proof, but claims never expire (see below).
- **Integer positions rewritten on reorder** are simple and correct at a 100-item cap. Fractional ranking would avoid rewrites at scale.
- **Debounced search-as-you-move** (with a "Search this area" mode) trades a few extra requests for never showing stale pins.

## What I cut, and why

Real SSO and roles (mocked with tokens), claim expiry/TTL and manager reassignment, activity logging (call outcomes, visit check-ins), routing/optimised visit order (the route is drawn in queue order, not optimised), offline mode, server-side clustering, and i18n (FR-CA). Each is important but not needed to prove the core loop: find, review, claim, prioritise.

## What changes for production

- **500,000 businesses**: move to **Postgres + PostGIS** (GiST index on `geography(Point)`, `ST_MakeEnvelope` / `ST_DWithin`). Cluster **server-side** (`ST_ClusterKMeans`/grid-snap per zoom, or pre-built **vector tiles** with Tippecanoe or Martin) so the client gets aggregates, not 500k points. Use keyset pagination for the list, `pg_trgm` or OpenSearch for keyword and typeahead, and cache hot tiles at the CDN.
- **Manager access to team queues**: add `teams`, `team_members` and `roles`, with RBAC enforced in the service layer (or Postgres RLS). Managers get read and reassign actions on `/teams/:id/queues`, plus an audit log of every claim, release and reassignment. Add **claim TTL** (e.g. auto-release after 14 days with no activity) so leads don't rot in a queue.
- **Live data from BigQuery**: don't query BigQuery on the request path (latency, cost, quotas). Run a scheduled or CDC pipeline (Dataflow / scheduled queries → Pub/Sub) that upserts firmographics and the **lead score computed in the warehouse** into operational Postgres, with `source_updated_at` for freshness. The app stays fast, and the score model can evolve (e.g. BigQuery ML) without app changes.
- **Ops**: real tiles (commercial provider or self-hosted vector tiles), OIDC SSO, rate limiting, structured logs and tracing, Playwright end-to-end tests in CI, and feature flags for score changes.
