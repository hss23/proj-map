PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agents (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE,      -- mock auth: bearer token -> agent
  territory   TEXT NOT NULL,
  home_lat    REAL NOT NULL,
  home_lng    REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS businesses (
  id                  INTEGER PRIMARY KEY,
  name                TEXT    NOT NULL,
  industry            TEXT    NOT NULL,
  sub_category        TEXT    NOT NULL,
  address             TEXT    NOT NULL,
  neighbourhood       TEXT    NOT NULL,
  city                TEXT    NOT NULL,
  postal_code         TEXT    NOT NULL,
  lat                 REAL    NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng                 REAL    NOT NULL CHECK (lng BETWEEN -180 AND 180),
  phone               TEXT,
  website             TEXT,
  employee_count      INTEGER NOT NULL CHECK (employee_count > 0),
  employee_band       TEXT    NOT NULL CHECK (employee_band IN ('1-9','10-49','50-199','200+')),
  revenue_band        TEXT    NOT NULL,
  year_established    INTEGER,
  telus_status        TEXT    NOT NULL CHECK (telus_status IN ('none','mobility','internet','mobility+internet')),
  competitor_provider TEXT,               -- provider for services not with TELUS (NULL if fully TELUS)
  contract_end_date   TEXT,               -- ISO date of competitor contract end (renewal window)
  lead_score          INTEGER NOT NULL CHECK (lead_score BETWEEN 0 AND 100),
  scored_at           TEXT    NOT NULL,           -- when lead_score was computed (its breakdown is "as of" this)
  last_contacted_at   TEXT,
  notes               TEXT
);

CREATE INDEX IF NOT EXISTS idx_businesses_industry     ON businesses(industry);
CREATE INDEX IF NOT EXISTS idx_businesses_lead_score   ON businesses(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_businesses_telus_status ON businesses(telus_status);
CREATE INDEX IF NOT EXISTS idx_businesses_contract_end ON businesses(contract_end_date);

-- Spatial index: points stored as degenerate boxes. Bounding-box queries hit
-- the R*Tree instead of scanning every row.
CREATE VIRTUAL TABLE IF NOT EXISTS business_rtree USING rtree(
  id,
  min_lng, max_lng,
  min_lat, max_lat
);

-- Keyword search (prefix matching) over the text fields an agent would type.
CREATE VIRTUAL TABLE IF NOT EXISTS business_fts USING fts5(
  name, sub_category, industry, address, neighbourhood, city,
  content = 'businesses',
  content_rowid = 'id',
  tokenize = 'unicode61 remove_diacritics 2'
);

-- A business can be in at most ONE queue (UNIQUE business_id). This is the
-- source of truth for "no duplicates" and "a lead claimed by one agent can't
-- be claimed by another", and it holds even under concurrent requests.
CREATE TABLE IF NOT EXISTS queue_items (
  id           INTEGER PRIMARY KEY,
  agent_id     TEXT    NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  business_id  INTEGER NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  priority     TEXT    NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  note         TEXT    CHECK (note IS NULL OR length(note) <= 500),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_queue_agent_position ON queue_items(agent_id, position);
