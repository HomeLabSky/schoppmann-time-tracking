import { and, count, desc, eq, gte, like, lte, notLike, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { auditLogs, type AuditLogRow } from '../db/schema';

/** Auslöser einer Änderung; null = System/Skript */
export type Actor = { id: number; email?: string | null } | null;

/** Felder, die nie im Protokoll landen dürfen (auch nicht gehasht). */
const SECRET_KEYS = new Set(['password', 'passwordHash', 'accessToken', 'refreshToken', 'token']);

export const stripSecrets = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SECRET_KEYS.has(key))
        .map(([key, v]) => [key, stripSecrets(v)])
    );
  }
  return value;
};

export interface AuditEntryInput {
  actor: Actor;
  /** z. B. 'time_entry.update' */
  action: string;
  /** z. B. 'TimeEntry' */
  entityType: string;
  entityId?: number | null;
  /** betroffener Mitarbeiter */
  targetUserId?: number | null;
  before?: unknown;
  after?: unknown;
  /** z. B. { reason } */
  meta?: unknown;
}

export interface AuditFilter {
  page?: number;
  limit?: number;
  userId?: number;
  action?: string;
  exclude?: string;
  entityType?: string;
  from?: string;
  to?: string;
}

/**
 * Änderungsprotokoll: schreibt unveränderliche Einträge und liest sie für Admins.
 *
 * `record` ist synchron und gehört in dieselbe Transaktion wie die protokollierte Änderung
 * (`transaction(() => { …; AuditService.record(…) })`) – dann gibt es nie eine Änderung ohne
 * Protokolleintrag (und umgekehrt). Unveränderlichkeit: SQLite-Trigger (drizzle/0001).
 */
export class AuditService {
  static record(entry: AuditEntryInput): AuditLogRow {
    const { actor, action, entityType, entityId = null, targetUserId = null, before = null, after = null, meta = null } = entry;
    if (!action || !entityType) {
      throw new Error('Protokolleintrag ohne action/entityType');
    }
    return db().insert(auditLogs).values({
      actorId: actor?.id ?? null,
      actorEmail: actor?.email || 'system',
      action,
      entityType,
      entityId,
      targetUserId,
      before: before == null ? null : stripSecrets(before),
      after: after == null ? null : stripSecrets(after),
      meta: meta == null ? null : stripSecrets(meta)
    }).returning().get();
  }

  /** Protokoll durchsuchen (neueste zuerst). */
  static async list(filter: AuditFilter = {}) {
    const page = Math.max(1, filter.page || 1);
    const limit = Math.min(200, Math.max(1, filter.limit || 50));

    const conditions: SQL[] = [];
    if (filter.userId) conditions.push(eq(auditLogs.targetUserId, filter.userId));
    if (filter.entityType) conditions.push(eq(auditLogs.entityType, filter.entityType));
    if (filter.action) conditions.push(like(auditLogs.action, `${filter.action}%`));
    // exclude: kommagetrennte Präfixe, z. B. "auth" blendet Anmelde-Ereignisse aus
    String(filter.exclude || '').split(',').map((p) => p.trim()).filter(Boolean)
      .forEach((prefix) => conditions.push(notLike(auditLogs.action, `${prefix}%`)));
    if (filter.from) conditions.push(gte(auditLogs.createdAt, new Date(`${filter.from}T00:00:00`)));
    if (filter.to) conditions.push(lte(auditLogs.createdAt, new Date(`${filter.to}T23:59:59.999`)));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = db().select().from(auditLogs).where(where)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(limit).offset((page - 1) * limit)
      .all();
    const total = db().select({ n: count() }).from(auditLogs).where(where).get()?.n ?? 0;

    return {
      entries: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }
}

export default AuditService;
