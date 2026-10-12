import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { ValidationError } from '../lib/errors';

type Source = 'body' | 'query' | 'params';

function formatIssues(err: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export function validate<T extends ZodTypeAny>(source: Source, schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(new ValidationError(`Invalid ${source}`, formatIssues(result.error)));
      return;
    }
    // Express 4 lets us replace these; keep parsed, coerced values.
    (req as unknown as Record<Source, unknown>)[source] = result.data;
    next();
  };
}

/** Typed accessor for a validated body. */
export function body<T extends ZodTypeAny>(req: Request, _schema: T): z.infer<T> {
  return req.body as z.infer<T>;
}

export function query<T extends ZodTypeAny>(req: Request, _schema: T): z.infer<T> {
  return req.query as unknown as z.infer<T>;
}
