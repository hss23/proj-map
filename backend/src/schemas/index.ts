import Joi from 'joi';
import {
  CLAIM_FILTERS,
  DEFAULT_SEARCH_LIMIT,
  EMPLOYEE_BANDS,
  INDUSTRIES,
  MAX_SEARCH_LIMIT,
  PRIORITIES,
  SORTS,
  TELUS_STATUSES,
} from '../domain/constants';

export interface BBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/** Largest bbox we serve, in degrees. Roughly all of Metro Vancouver plus margin; beyond this the client should zoom in. */
export const MAX_BBOX_SPAN = { lng: 3, lat: 2 };

/** "a,b,c" -> ['a','b','c'], each validated against `allowed`. Also accepts repeated params (?x=a&x=b). */
const csvOf = (allowed: readonly string[]) =>
  Joi.alternatives()
    .try(Joi.array().items(Joi.string()), Joi.string())
    .custom((value: string | string[], helpers) => {
      const items = (Array.isArray(value) ? value : value.split(','))
        .map((s) => s.trim())
        .filter(Boolean);
      const bad = items.filter((i) => !allowed.includes(i));
      if (bad.length) return helpers.message({ custom: `contains invalid value(s): ${bad.join(', ')}. Allowed: ${allowed.join(' | ')}` });
      return [...new Set(items)];
    });

const bbox = Joi.string()
  .required()
  .custom((value: string, helpers) => {
    const parts = value.split(',').map((p) => Number(p.trim()));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      return helpers.message({ custom: 'bbox must be "minLng,minLat,maxLng,maxLat"' });
    }
    const [minLng, minLat, maxLng, maxLat] = parts;
    if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) {
      return helpers.message({ custom: 'bbox coordinates out of range' });
    }
    if (minLng >= maxLng || minLat >= maxLat) {
      return helpers.message({ custom: 'bbox min values must be less than max values' });
    }
    if (maxLng - minLng > MAX_BBOX_SPAN.lng || maxLat - minLat > MAX_BBOX_SPAN.lat) {
      return helpers.message({ custom: `bbox too large (max ${MAX_BBOX_SPAN.lng}° × ${MAX_BBOX_SPAN.lat}°): zoom in` });
    }
    return { minLng, minLat, maxLng, maxLat } satisfies BBox;
  });

const point = Joi.string().custom((value: string, helpers) => {
  const parts = value.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) {
    return helpers.message({ custom: 'must be "lng,lat"' });
  }
  const [lng, lat] = parts;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return helpers.message({ custom: 'coordinates out of range' });
  return { lng, lat };
});

export const searchQuery = Joi.object({
  bbox,
  q: Joi.string().trim().max(100).allow(''),
  industry: csvOf(INDUSTRIES),
  employeeBand: csvOf(EMPLOYEE_BANDS),
  telusStatus: csvOf(TELUS_STATUSES),
  minScore: Joi.number().integer().min(0).max(100),
  renewalWithinDays: Joi.number().integer().min(1).max(730),
  claim: Joi.string().valid(...CLAIM_FILTERS).default('all'),
  sort: Joi.string().valid(...SORTS).default('score'),
  center: point,
  limit: Joi.number().integer().min(1).max(MAX_SEARCH_LIMIT).default(DEFAULT_SEARCH_LIMIT),
}).custom((value, helpers) => {
  if (value.sort === 'distance' && !value.center) {
    return helpers.message({ custom: 'center is required when sort=distance' });
  }
  return value;
});

export const suggestQuery = Joi.object({
  q: Joi.string().trim().min(1).max(100).required(),
  limit: Joi.number().integer().min(1).max(20).default(8),
});

export const businessIdParams = Joi.object({
  id: Joi.number().integer().positive().required(),
});

export const queueBusinessParams = Joi.object({
  businessId: Joi.number().integer().positive().required(),
});

const note = Joi.string().trim().max(500).allow('', null);

export const addToQueueBody = Joi.object({
  businessId: Joi.number().integer().positive().strict().required(),
  priority: Joi.string().valid(...PRIORITIES).default('medium'),
  note,
  /** Optional 0-based insert position (used by "undo remove"); defaults to the end. */
  position: Joi.number().integer().min(0).strict(),
}).required();

export const updateQueueBody = Joi.object({
  priority: Joi.string().valid(...PRIORITIES),
  note,
})
  .or('priority', 'note')
  .required();

export const reorderQueueBody = Joi.object({
  businessIds: Joi.array().items(Joi.number().integer().positive().strict()).unique().max(500).required(),
}).required();
