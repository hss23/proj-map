import type { Request, RequestHandler } from 'express';
import type Joi from 'joi';
import { AppError } from '../errors';

type Part = 'query' | 'params' | 'body';
export type SchemaMap = Partial<Record<Part, Joi.Schema>>;

declare module 'express-serve-static-core' {
  interface Request {
    /** Validated + coerced inputs. Handlers read from here, never from raw req.query/body. */
    valid: { query?: any; params?: any; body?: any };
  }
}

/**
 * Validates request parts against Joi schemas, collecting all errors
 * (abortEarly: false) so the client can show every bad field at once.
 */
export function validate(schemas: SchemaMap): RequestHandler {
  return (req, _res, next) => {
    req.valid = req.valid ?? {};
    const details: Array<{ in: Part; path: string; message: string }> = [];
    for (const part of Object.keys(schemas) as Part[]) {
      const schema = schemas[part]!;
      const { value, error } = schema.validate(req[part as keyof Request], {
        abortEarly: false,
        stripUnknown: part !== 'body', // unknown body fields are an error; unknown query params are ignored
        convert: true,
      });
      if (error) {
        for (const d of error.details) {
          details.push({ in: part, path: d.path.join('.') || part, message: d.message.replace(/"/g, '') });
        }
      } else {
        req.valid[part] = value;
      }
    }
    if (details.length) return next(new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details));
    next();
  };
}
