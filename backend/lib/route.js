/**
 * Routen-Definition mit Vertrag: Jede Route beschreibt Berechtigung, Eingaben (zod) und Antwort (zod).
 *
 *   const api = createApiRouter('/timetracking', { tags: ['Zeiterfassung'] });
 *   api.post('/', {
 *     summary: 'Zeiteintrag anlegen',
 *     auth: 'user',                       // 'public' | 'user' | 'employee' | 'admin'
 *     body: CreateTimeEntryBody,          // geprüft → req.valid.body (unbekannte Felder werden entfernt)
 *     response: TimeEntryData,            // Form von `data` (OpenAPI; in Tests auch geprüft)
 *     status: 201,
 *     errors: ['ENTRY_EXISTS', 'PERIOD_CLOSED']
 *   }, async (req) => ({ status, message, data }));
 *
 * Der Handler gibt `{ data, message, status }` zurück; daraus wird `{ success: true, message, data }`.
 * Fehler wirft er als AppError – Express 5 reicht sie an den zentralen Error-Handler weiter.
 * Aus denselben Angaben entsteht das OpenAPI-Dokument (lib/openapi.js).
 */
const express = require('express');
const { AppError } = require('./errors');
const { registerRoute } = require('./openapi');
const { authenticateToken, requireAdmin, requireEmployee } = require('../middleware/auth');

const API_DOC_PREFIX = '/api/v1';

const AUTH_MIDDLEWARE = {
  public: [],
  user: [authenticateToken],
  employee: [requireEmployee],
  admin: [requireAdmin]
};

// Antworten in Tests gegen das dokumentierte Schema prüfen: hält OpenAPI und Wirklichkeit deckungsgleich
const VALIDATE_RESPONSES = process.env.VALIDATE_RESPONSES === '1';

// Welche Routen haben in diesem Lauf erfolgreich geantwortet (nur bei VALIDATE_RESPONSES, für den Smoke-Test)
const respondedRoutes = new Set();

const fieldKey = (issue) => (issue.path.length > 0 ? issue.path.join('.') : '_');

/** zod-Fehler → VALIDATION_ERROR mit Meldung je Feld (Format wie bisher: details[] und fields{}) */
const validationError = (issues) => {
  const fields = {};
  for (const issue of issues) {
    const key = fieldKey(issue);
    if (!fields[key]) fields[key] = issue.message;
  }
  return new AppError('VALIDATION_ERROR', 'Eingabefehler', {
    fields,
    details: Object.values(fields)
  });
};

const validateRequest = (spec) => (req, res, next) => {
  const valid = {};
  const issues = [];
  for (const [key, source] of [['params', req.params], ['query', req.query], ['body', req.body]]) {
    if (!spec[key]) continue;
    const result = spec[key].safeParse(source ?? {});
    if (result.success) valid[key] = result.data;
    else issues.push(...result.error.issues);
  }
  if (issues.length > 0) return next(validationError(issues));
  req.valid = valid;
  next();
};

const respond = (spec, handler) => async (req, res) => {
  const result = (await handler(req, res)) || {};
  if (res.headersSent) return;

  const { data, message = spec.message, status = spec.status || 200 } = result;

  if (VALIDATE_RESPONSES) respondedRoutes.add(spec.routeKey);
  if (VALIDATE_RESPONSES && spec.response) {
    const plain = JSON.parse(JSON.stringify(data ?? null));
    const check = spec.response.safeParse(plain);
    if (!check.success) {
      const error = new Error(`Antwort von ${req.method} ${req.originalUrl} passt nicht zum Schema: ${JSON.stringify(check.error.issues.slice(0, 5))}`);
      error.responseSchemaMismatch = true;
      throw error;
    }
  }

  res.status(status).json({ success: true, message, ...(data !== undefined ? { data } : {}) });
};

/**
 * @param {string} mountPath Pfad, unter dem der Router in routes/index.js eingehängt wird (z. B. '/admin/users')
 * @param {{ tags: string[] }} defaults
 */
const createApiRouter = (mountPath, { tags = [] } = {}) => {
  const router = express.Router();

  const add = (method) => (path, spec, handler) => {
    if (!spec || !spec.summary) throw new Error(`Route ${method.toUpperCase()} ${mountPath}${path}: summary fehlt`);
    const fullSpec = { ...spec, auth: spec.auth || 'user', tags: spec.tags || tags };
    const docPath = `${API_DOC_PREFIX}${mountPath}${path === '/' ? '' : path}` || '/';
    fullSpec.routeKey = `${method.toUpperCase()} ${docPath}`;
    registerRoute(method, docPath, fullSpec);
    router[method](path, ...AUTH_MIDDLEWARE[fullSpec.auth], validateRequest(fullSpec), respond(fullSpec, handler));
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

module.exports = { createApiRouter, validationError, respondedRoutes };
