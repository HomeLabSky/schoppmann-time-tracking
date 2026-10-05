/**
 * Routen-Definition mit Vertrag: Jede Route beschreibt Berechtigung, Eingaben (zod) und Antwort (zod).
 *
 *   const api = createApiRouter('/timetracking', { tags: ['Zeiterfassung'] });
 *   api.post('/', {
 *     summary: 'Zeiteintrag anlegen',
 *     auth: 'user',                       // 'public' | 'user' | 'employee' | 'admin'
 *     body: CreateTimeEntryBody,          // geprüft → req.valid.body (typisiert, unbekannte Felder entfernt)
 *     response: EntryData,                // Form von `data` (OpenAPI; in Tests auch geprüft)
 *     status: 201,
 *     errors: ['ENTRY_OVERLAP', 'PERIOD_CLOSED']
 *   }, async (req) => ({ status, message, data }));
 *
 * Der Handler gibt `{ data, message, status }` zurück; daraus wird `{ success: true, message, data }`.
 * Fehler wirft er als AppError – Express 5 reicht sie an den zentralen Error-Handler weiter.
 * Aus denselben Angaben entsteht das OpenAPI-Dokument (lib/openapi.ts).
 */
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { z } from 'zod';
import { authenticateToken, requireAdmin, requireEmployee, type AuthUser } from '../middleware/auth';
import { AppError, type ErrorCode } from './errors';
import { registerRoute } from './openapi';

const API_DOC_PREFIX = '/api/v1';

export type AuthLevel = 'public' | 'user' | 'employee' | 'admin';
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type AnySchema = z.ZodType;

const AUTH_MIDDLEWARE: Record<AuthLevel, RequestHandler[]> = {
  public: [],
  user: [authenticateToken],
  employee: [requireEmployee],
  admin: [requireAdmin]
};

export interface RouteSpec<
  A extends AuthLevel = AuthLevel,
  P extends AnySchema | undefined = undefined,
  Q extends AnySchema | undefined = undefined,
  B extends AnySchema | undefined = undefined
> {
  summary: string;
  description?: string;
  /** Standard: 'user' */
  auth?: A;
  params?: P;
  query?: Q;
  body?: B;
  /** Form von `data` in der Erfolgsantwort */
  response?: AnySchema;
  /** Erfolgsstatus (Standard 200) */
  status?: number;
  message?: string;
  /** Fachliche Fehlercodes dieser Route (für die Doku) */
  errors?: ErrorCode[];
  tags?: string[];
  operationId?: string;
}

/** Vollständige Angaben einer registrierten Route (für OpenAPI und Smoke-Test) */
export interface RegisteredSpec extends RouteSpec<AuthLevel, AnySchema | undefined, AnySchema | undefined, AnySchema | undefined> {
  auth: AuthLevel;
  tags: string[];
  routeKey: string;
}

type Parsed<S> = S extends AnySchema ? z.output<S> : Record<string, never>;

/** Anfrage im Handler: geprüfte Eingaben in `valid`, bei angemeldeten Routen ist `user` gesetzt */
export type ApiRequest<A extends AuthLevel, P, Q, B> = Request & {
  valid: { params: Parsed<P>; query: Parsed<Q>; body: Parsed<B> };
  user: A extends 'public' ? AuthUser | undefined : AuthUser;
};

export interface HandlerResult {
  data?: unknown;
  message?: string;
  status?: number;
}

type Handler<A extends AuthLevel, P, Q, B> = (
  req: ApiRequest<A, P, Q, B>,
  res: Response
) => Promise<HandlerResult | void> | HandlerResult | void;

// Antworten in Tests gegen das dokumentierte Schema prüfen: hält OpenAPI und Wirklichkeit deckungsgleich
const VALIDATE_RESPONSES = process.env.VALIDATE_RESPONSES === '1';

/** Welche Routen haben in diesem Lauf erfolgreich geantwortet (nur bei VALIDATE_RESPONSES, für den Smoke-Test) */
export const respondedRoutes = new Set<string>();

const fieldKey = (issue: z.core.$ZodIssue): string => (issue.path.length > 0 ? issue.path.join('.') : '_');

/** zod-Fehler → VALIDATION_ERROR mit Meldung je Feld (Format: details[] und fields{}) */
export const validationError = (issues: z.core.$ZodIssue[]): AppError => {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = fieldKey(issue);
    if (!fields[key]) fields[key] = issue.message;
  }
  return new AppError('VALIDATION_ERROR', 'Eingabefehler', { fields, details: Object.values(fields) });
};

const validateRequest = (spec: RegisteredSpec): RequestHandler => (req, _res, next) => {
  const valid: Record<string, unknown> = { params: {}, query: {}, body: {} };
  const issues: z.core.$ZodIssue[] = [];
  const sources = { params: req.params, query: req.query, body: req.body as unknown } as const;
  for (const key of ['params', 'query', 'body'] as const) {
    const schema = spec[key];
    if (!schema) continue;
    const result = schema.safeParse(sources[key] ?? {});
    if (result.success) valid[key] = result.data;
    else issues.push(...result.error.issues);
  }
  if (issues.length > 0) return next(validationError(issues));
  (req as Request & { valid: unknown }).valid = valid;
  next();
};

const respond = (spec: RegisteredSpec, handler: Handler<AuthLevel, unknown, unknown, unknown>) =>
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const result = (await handler(req as ApiRequest<AuthLevel, unknown, unknown, unknown>, res)) || {};
    if (res.headersSent) return;

    const { data, message = spec.message, status = spec.status || 200 } = result;

    if (VALIDATE_RESPONSES) respondedRoutes.add(spec.routeKey);
    if (VALIDATE_RESPONSES && spec.response) {
      const plain: unknown = JSON.parse(JSON.stringify(data ?? null));
      const check = spec.response.safeParse(plain);
      if (!check.success) {
        throw new Error(`Antwort von ${req.method} ${req.originalUrl} passt nicht zum Schema: ${JSON.stringify(check.error.issues.slice(0, 5))}`);
      }
    }

    res.status(status).json({ success: true, message, ...(data !== undefined ? { data } : {}) });
  };

/**
 * @param mountPath Pfad, unter dem der Router in routes/index.ts eingehängt wird (z. B. '/admin/minijob')
 */
export const createApiRouter = (mountPath: string, { tags = [] }: { tags?: string[] } = {}) => {
  const router = express.Router();

  const add = (method: Method) =>
    <
      A extends AuthLevel = 'user',
      P extends AnySchema | undefined = undefined,
      Q extends AnySchema | undefined = undefined,
      B extends AnySchema | undefined = undefined
    >(path: string, spec: RouteSpec<A, P, Q, B>, handler: Handler<A, P, Q, B>): void => {
      if (!spec.summary) throw new Error(`Route ${method.toUpperCase()} ${mountPath}${path}: summary fehlt`);
      const docPath = `${API_DOC_PREFIX}${mountPath}${path === '/' ? '' : path}`;
      const fullSpec: RegisteredSpec = {
        ...spec,
        auth: spec.auth ?? 'user',
        tags: spec.tags ?? tags,
        routeKey: `${method.toUpperCase()} ${docPath}`
      };
      registerRoute(method, docPath, fullSpec);
      router[method](
        path,
        ...AUTH_MIDDLEWARE[fullSpec.auth],
        validateRequest(fullSpec),
        respond(fullSpec, handler as unknown as Handler<AuthLevel, unknown, unknown, unknown>)
      );
    };

  return {
    router,
    get: add('get'),
    post: add('post'),
    put: add('put'),
    patch: add('patch'),
    delete: add('delete')
  };
};
