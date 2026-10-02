const { Op } = require('sequelize');
const { AuditLog } = require('../models');

/** Felder, die nie im Protokoll landen dürfen (auch nicht gehasht). */
const SECRET_KEYS = new Set(['password', 'passwordHash', 'accessToken', 'refreshToken', 'token']);

const stripSecrets = (value) => {
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

/**
 * Änderungsprotokoll: schreibt unveränderliche Einträge und liest sie für Admins.
 *
 * `record` gehört in dieselbe Transaktion wie die protokollierte Änderung – dann
 * gibt es nie eine Änderung ohne Protokolleintrag (und umgekehrt).
 */
class AuditService {
  /**
   * @param {Object} entry
   * @param {{id:number,email:string}|null} entry.actor Auslöser (null = System/Skript)
   * @param {string} entry.action z. B. 'time_entry.update'
   * @param {string} entry.entityType z. B. 'TimeEntry'
   * @param {number|null} [entry.entityId]
   * @param {number|null} [entry.targetUserId] betroffener Mitarbeiter
   * @param {Object|null} [entry.before] Zustand vorher
   * @param {Object|null} [entry.after] Zustand nachher
   * @param {Object|null} [entry.meta] z. B. { reason }
   * @param {{transaction?:Object}} [options]
   */
  static async record(entry, options = {}) {
    const { actor, action, entityType, entityId = null, targetUserId = null, before = null, after = null, meta = null } = entry;
    if (!action || !entityType) {
      throw new Error('AUDIT_INVALID:action und entityType sind erforderlich');
    }
    return AuditLog.create({
      actorId: actor?.id ?? null,
      actorEmail: actor?.email || 'system',
      action,
      entityType,
      entityId,
      targetUserId,
      before: before && stripSecrets(before),
      after: after && stripSecrets(after),
      meta: meta && stripSecrets(meta)
    }, { transaction: options.transaction });
  }

  /**
   * Protokoll durchsuchen (neueste zuerst).
   * @param {{page?:number,limit?:number,userId?:number,action?:string,exclude?:string,entityType?:string,from?:string,to?:string}} filter
   */
  static async list(filter = {}) {
    const page = Math.max(1, parseInt(filter.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(filter.limit) || 50));

    const where = {};
    if (filter.userId) where.targetUserId = parseInt(filter.userId);
    if (filter.entityType) where.entityType = filter.entityType;
    const clauses = [];
    if (filter.action) clauses.push({ action: { [Op.like]: `${filter.action}%` } });
    // exclude: kommagetrennte Präfixe, z. B. "auth" blendet Anmelde-Ereignisse aus
    String(filter.exclude || '').split(',').map((p) => p.trim()).filter(Boolean)
      .forEach((prefix) => clauses.push({ action: { [Op.notLike]: `${prefix}%` } }));
    if (clauses.length > 0) where[Op.and] = clauses;
    if (filter.from || filter.to) {
      where.createdAt = {};
      if (filter.from) where.createdAt[Op.gte] = new Date(`${filter.from}T00:00:00`);
      if (filter.to) where.createdAt[Op.lte] = new Date(`${filter.to}T23:59:59.999`);
    }

    const { rows, count } = await AuditLog.findAndCountAll({
      where,
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit,
      offset: (page - 1) * limit
    });

    return {
      entries: rows.map((row) => row.toJSON()),
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) }
    };
  }
}

module.exports = AuditService;
