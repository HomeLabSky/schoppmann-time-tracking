/**
 * OpenAPI-3.1-Dokument aus den Routen-Definitionen (lib/route.js) und ihren zod-Schemas.
 *
 * Es gibt keine handgepflegte API-Doku: Jede Route trägt ihre Eingabe- und Antwort-Schemas selbst, daraus
 * entsteht dieses Dokument (GET /api/v1/openapi.json, Datei backend/openapi.json über `npm run openapi`).
 * Web-Oberfläche und App können daraus typisierte Clients erzeugen.
 */
const { z } = require('zod');
const { ERROR_STATUS } = require('./errors');

/** Alle registrierten Routen: { method, path, spec } – befüllt von lib/route.js */
const routes = [];

const registerRoute = (method, path, spec) => {
  routes.push({ method, path, spec });
};

// Lesbarkeit: Sicherheitsgrenzen von z.number().int(), Datumsmuster und "additionalProperties: false" aus der
// Ausgabe entfernen. Antworten können künftig weitere Felder bekommen; Clients sollen das tolerieren.
const tidy = (node) => {
  if (Array.isArray(node)) return node.map(tidy);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  // format: date reicht; das lange Prüfmuster von z.iso.date() macht das Dokument nur unlesbar
  const isDate = node.format === 'date' && typeof node.pattern === 'string';
  for (const [key, value] of Object.entries(node)) {
    if (key === '$schema') continue;
    if (isDate && key === 'pattern') continue;
    if (key === 'additionalProperties' && value === false) continue;
    if ((key === 'minimum' && value === Number.MIN_SAFE_INTEGER) || (key === 'maximum' && value === Number.MAX_SAFE_INTEGER)) continue;
    if (key === '$ref' && typeof value === 'string') {
      out[key] = value.replace('#/$defs/', '#/components/schemas/');
      continue;
    }
    out[key] = tidy(value);
  }
  return out;
};

/** zod → JSON-Schema; benannte Teilschemas (.meta({ id })) wandern nach components.schemas. */
const toSchema = (schema, io, components) => {
  const json = z.toJSONSchema(schema, { io, unrepresentable: 'any' });
  const defs = json.$defs || {};
  delete json.$defs;
  for (const [id, def] of Object.entries(defs)) {
    components[id] = tidy(def);
  }
  return tidy(json);
};

const envelope = (dataSchema, message) => ({
  type: 'object',
  required: ['success'],
  properties: {
    success: { const: true },
    message: { type: 'string', ...(message ? { examples: [message] } : {}) },
    ...(dataSchema ? { data: dataSchema } : {})
  }
});

const errorResponse = (description) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
});

const toPathParams = (path) => path.replace(/:(\w+)/g, '{$1}');

const operationId = (method, path) =>
  method + path
    .replace(/^\/api\/v1/, '')
    .split('/')
    .filter(Boolean)
    .map((part) => part.replace(/^:/, 'by-'))
    .map((part) => part.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(''))
    .join('');

const SECURITY = {
  public: [],
  user: [{ bearerAuth: [] }, { cookieAuth: [] }],
  employee: [{ bearerAuth: [] }, { cookieAuth: [] }],
  admin: [{ bearerAuth: [] }, { cookieAuth: [] }]
};

/**
 * @param {{ version: string }} options
 * @returns {object} OpenAPI-Dokument
 */
const buildOpenApiDocument = ({ version }) => {
  const components = {};
  const paths = {};

  for (const { method, path, spec } of routes) {
    const oasPath = toPathParams(path);
    const parameters = [];

    for (const [location, schema] of [['path', spec.params], ['query', spec.query]]) {
      if (!schema) continue;
      const json = toSchema(schema, 'input', components);
      const required = new Set(json.required || []);
      for (const [name, prop] of Object.entries(json.properties || {})) {
        const { description, ...rest } = prop;
        parameters.push({
          name,
          in: location,
          required: location === 'path' || required.has(name),
          ...(description ? { description } : {}),
          schema: rest
        });
      }
    }

    const auth = spec.auth || 'user';
    const status = String(spec.status || 200);
    const responses = {
      [status]: {
        description: spec.message || 'Erfolg',
        content: {
          'application/json': {
            schema: envelope(spec.response ? toSchema(spec.response, 'output', components) : null, spec.message)
          }
        }
      }
    };
    if (spec.params || spec.query || spec.body) responses['400'] = errorResponse('Eingabefehler (VALIDATION_ERROR, mit `fields`)');
    if (auth !== 'public') {
      responses['401'] = errorResponse('Nicht angemeldet oder Sitzung beendet');
      responses['403'] = errorResponse('Keine Berechtigung');
    }
    for (const code of spec.errors || []) {
      const errorStatus = String(ERROR_STATUS[code] || 500);
      const existing = responses[errorStatus];
      const description = existing && existing.description !== 'Erfolg'
        ? `${existing.description}, ${code}`
        : code;
      responses[errorStatus] = errorResponse(description);
    }

    const operation = {
      operationId: spec.operationId || operationId(method, path),
      summary: spec.summary,
      ...(spec.description ? { description: spec.description } : {}),
      tags: spec.tags,
      security: SECURITY[auth],
      ...(parameters.length > 0 ? { parameters } : {}),
      ...(spec.body
        ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: toSchema(spec.body, 'input', components) } }
          }
        }
        : {}),
      responses
    };

    paths[oasPath] = paths[oasPath] || {};
    paths[oasPath][method] = operation;
  }

  components.Error = {
    type: 'object',
    required: ['success', 'error', 'code'],
    properties: {
      success: { const: false },
      error: { type: 'string', description: 'Meldung für den Benutzer (deutsch)' },
      code: { type: 'string', enum: Object.keys(ERROR_STATUS), description: 'Maschinenlesbarer Fehlercode (stabil)' },
      fields: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Bei VALIDATION_ERROR: Meldung je Feld'
      },
      details: { type: 'array', items: { type: 'string' } },
      retryAfter: { type: 'integer', description: 'Sekunden bis zum nächsten Versuch (ACCOUNT_LOCKED, Rate-Limit)' },
      requestId: { type: 'string', description: 'Bei INTERNAL_ERROR: Kennung für die Fehlersuche im Log' }
    }
  };

  return {
    openapi: '3.1.0',
    info: {
      title: 'Schoppmann Zeiterfassung API',
      version,
      description: [
        'REST-API für Web-Oberfläche und App.',
        '',
        '**Anmeldung**',
        '- Web: `POST /auth/login` setzt httpOnly-Cookies. Ändernde Anfragen brauchen den Header `X-CSRF-Protection: 1`.',
        '- App: `POST /auth/token` liefert Zugriffs- und Erneuerungs-Token im Body. Anfragen tragen',
        '  `Authorization: Bearer <accessToken>`; erneuern über `POST /auth/token/refresh` (das Erneuerungs-Token',
        '  wird dabei ausgetauscht – das alte ist danach ungültig). Kein CSRF-Header nötig.',
        '',
        '**Fehler** haben immer die Form `{ success:false, error, code }`. `401` heißt nur "nicht angemeldet";',
        'der Client erneuert dann still die Sitzung. Fachliche Ablehnungen sind 400/403/409.',
        '',
        '**Offline-Erfassung**: `POST /timetracking` akzeptiert eine `clientId` (UUID). Eine Wiederholung mit',
        'derselben `clientId` legt nichts doppelt an, sondern liefert den bestehenden Eintrag (200 statt 201).'
      ].join('\n')
    },
    servers: [{ url: '/api/v1' }],
    tags: [
      { name: 'Anmeldung' },
      { name: 'Zeiterfassung' },
      { name: 'Mitarbeiter' },
      { name: 'Benutzerverwaltung' },
      { name: 'Minijob-Grenzen' },
      { name: 'Zeitnachweise' },
      { name: 'Änderungsprotokoll' },
      { name: 'System' }
    ],
    paths: Object.fromEntries(
      Object.entries(paths).map(([p, ops]) => [p.replace(/^\/api\/v1/, '') || '/', ops])
    ),
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'App: Zugriffs-Token aus POST /auth/token' },
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'zeit_access', description: 'Web: httpOnly-Cookie aus POST /auth/login' }
      },
      schemas: Object.fromEntries(Object.entries(components).sort(([a], [b]) => a.localeCompare(b)))
    }
  };
};

module.exports = { registerRoute, buildOpenApiDocument, routes };
