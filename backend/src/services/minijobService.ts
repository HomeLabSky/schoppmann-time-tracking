import { and, asc, count, desc, eq, gt, gte, isNull, lt, lte, ne, or, type SQL } from 'drizzle-orm';
import { db, transaction } from '../db/client';
import { minijobSettings, users, type MinijobSetting } from '../db/schema';
import { AppError } from '../lib/errors';
import { AuditService, type Actor } from './auditService';
import { DateService } from './dateService';

/** Für das Änderungsprotokoll: fachlich relevante Felder einer Minijob-Einstellung. */
const settingSnapshot = (setting: MinijobSetting) => ({
  monthlyLimit: Number(setting.monthlyLimit),
  description: setting.description,
  validFrom: setting.validFrom,
  validUntil: setting.validUntil || null
});

export type MinijobSettingWithCreator = MinijobSetting & { Creator: { name: string; email: string } | null };

export interface MinijobSettingInput {
  monthlyLimit: number;
  description: string;
  /** YYYY-MM-DD (vom Schema geprüft) */
  validFrom: string;
  /** YYYY-MM-DD oder null = unbegrenzt */
  validUntil: string | null;
}

export interface Adjustment {
  id: number;
  description: string;
  validFrom?: string;
  oldValidUntil: string;
  newValidUntil: string;
}

/** Heute gültig: validFrom ≤ Stichtag und (unbegrenzt oder validUntil ≥ Stichtag) */
const validOn = (date: string): SQL =>
  and(lte(minijobSettings.validFrom, date), or(isNull(minijobSettings.validUntil), gte(minijobSettings.validUntil, date))) as SQL;

const withCreator = () =>
  db().select({ setting: minijobSettings, creator: { name: users.name, email: users.email } })
    .from(minijobSettings)
    .leftJoin(users, eq(users.id, minijobSettings.createdBy));

const attachCreator = (row: { setting: MinijobSetting; creator: { name: string; email: string } | null }): MinijobSettingWithCreator =>
  ({ ...row.setting, Creator: row.creator });

const findSetting = (id: number): MinijobSetting | undefined =>
  db().select().from(minijobSettings).where(eq(minijobSettings.id, id)).get();

/**
 * Minijob-Grenzen mit Gültigkeitszeiträumen: Überschneidungsprüfung, automatische Anpassung der
 * Vorgänger-Grenze, Neuberechnung. Jede Änderung steht im Änderungsprotokoll.
 */
export class MinijobService {
  /** Am Stichtag (Standard: heute) gültige Einstellung inkl. Ersteller */
  static async getCurrentSetting(referenceDate: string | null = null): Promise<MinijobSettingWithCreator | null> {
    const row = withCreator().where(validOn(referenceDate || DateService.getTodayString()))
      .orderBy(desc(minijobSettings.validFrom)).get();
    return row ? attachCreator(row) : null;
  }

  /** Am Stichtag gültige Einstellung ohne Ersteller (für Mitarbeiter-Ansichten) */
  static currentSettingSync(referenceDate: string = DateService.getTodayString()): MinijobSetting | null {
    return db().select().from(minijobSettings).where(validOn(referenceDate))
      .orderBy(desc(minijobSettings.validFrom)).get() ?? null;
  }

  /** Alle Einstellungen (neueste zuerst) mit Seiten und Filter aktiv/inaktiv */
  static async getAllSettings({ page = 1, limit = 20, status = '' }: { page?: number; limit?: number; status?: string } = {}) {
    const where = status === 'active' ? eq(minijobSettings.isActive, true)
      : status === 'inactive' ? eq(minijobSettings.isActive, false)
        : undefined;
    const rows = withCreator().where(where).orderBy(desc(minijobSettings.validFrom))
      .limit(limit).offset((page - 1) * limit).all();
    const total = db().select({ n: count() }).from(minijobSettings).where(where).get()?.n ?? 0;
    return {
      settings: rows.map(attachCreator),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  /**
   * Neue Einstellung. Überschneidet sie sich nur mit einer unbefristeten früheren Einstellung, wird diese zum
   * Vortag beendet; andere Überschneidungen → OVERLAPPING_PERIODS.
   */
  static async createSetting(data: MinijobSettingInput, createdBy: number, actor: Actor) {
    const result = transaction(() => {
      const overlapping = this.findOverlaps(data.validFrom, data.validUntil);
      const autoAdjustedSettings = overlapping.length > 0 ? this.handleOverlapForCreate(overlapping, data.validFrom) : [];

      const setting = db().insert(minijobSettings).values({
        monthlyLimit: Number(data.monthlyLimit),
        description: data.description,
        validFrom: data.validFrom,
        validUntil: data.validUntil,
        createdBy
      }).returning().get();

      AuditService.record({
        actor,
        action: 'minijob_setting.create',
        entityType: 'MinijobSetting',
        entityId: setting.id,
        after: settingSnapshot(setting),
        meta: autoAdjustedSettings.length > 0 ? { autoAdjustedSettings } : null
      });
      return { id: setting.id, autoAdjustedSettings };
    });

    this.updateActiveStatusSync();
    return { setting: findSetting(result.id) as MinijobSetting, autoAdjustedSettings: result.autoAdjustedSettings };
  }

  /** Einstellung ändern */
  static async updateSetting(settingId: number, data: MinijobSettingInput, actor: Actor): Promise<MinijobSetting> {
    const setting = findSetting(settingId);
    if (!setting) throw new AppError('SETTING_NOT_FOUND', 'Minijob-Einstellung nicht gefunden');

    transaction(() => {
      const updated = db().update(minijobSettings).set({
        monthlyLimit: Number(data.monthlyLimit),
        description: data.description,
        validFrom: data.validFrom,
        validUntil: data.validUntil
      }).where(eq(minijobSettings.id, settingId)).returning().get() as MinijobSetting;
      AuditService.record({
        actor,
        action: 'minijob_setting.update',
        entityType: 'MinijobSetting',
        entityId: setting.id,
        before: settingSnapshot(setting),
        after: settingSnapshot(updated)
      });
    });

    this.updateActiveStatusSync();
    return findSetting(settingId) as MinijobSetting;
  }

  /** Künftige Einstellung löschen; die vorherige reicht dann bis zur nächsten (oder unbegrenzt) */
  static async deleteSetting(settingId: number, actor: Actor) {
    const result = transaction(() => {
      const setting = findSetting(settingId);
      if (!setting) throw new AppError('SETTING_NOT_FOUND', 'Minijob-Einstellung nicht gefunden');

      // Nur zukünftige Einstellungen dürfen gelöscht werden
      if (setting.validFrom <= DateService.getTodayString()) {
        throw new AppError('CANNOT_DELETE_ACTIVE', 'Aktive oder vergangene Einstellungen können nicht gelöscht werden');
      }

      const adjustedSettings = this.handleDeletionAdjustment(setting);
      db().delete(minijobSettings).where(eq(minijobSettings.id, settingId)).run();
      AuditService.record({
        actor,
        action: 'minijob_setting.delete',
        entityType: 'MinijobSetting',
        entityId: setting.id,
        before: settingSnapshot(setting),
        meta: adjustedSettings.length > 0 ? { adjustedSettings } : null
      });
      return {
        deletedSetting: { id: setting.id, description: setting.description, validFrom: setting.validFrom, validUntil: setting.validUntil },
        adjustedSettings
      };
    });

    this.updateActiveStatusSync();
    return result;
  }

  /** Zeiträume lückenlos neu berechnen: jede Einstellung endet am Vortag der nächsten, die letzte unbegrenzt */
  static async recalculateAllPeriods(actor: Actor) {
    const result = transaction(() => {
      const all = db().select().from(minijobSettings).orderBy(asc(minijobSettings.validFrom)).all();
      const adjustments: Adjustment[] = [];

      all.forEach((current, i) => {
        const next = all[i + 1];
        const newValidUntil = next ? DateService.getDateBefore(next.validFrom) : null;
        if (current.validUntil !== newValidUntil) {
          db().update(minijobSettings).set({ validUntil: newValidUntil }).where(eq(minijobSettings.id, current.id)).run();
          adjustments.push({
            id: current.id,
            description: current.description,
            validFrom: current.validFrom,
            oldValidUntil: current.validUntil || 'unbegrenzt',
            newValidUntil: newValidUntil || 'unbegrenzt'
          });
        }
      });

      if (adjustments.length > 0) {
        AuditService.record({
          actor,
          action: 'minijob_setting.recalculate',
          entityType: 'MinijobSetting',
          meta: { adjustedCount: adjustments.length, adjustments }
        });
      }
      return { adjustedCount: adjustments.length, adjustments };
    });

    this.updateActiveStatusSync();
    return result;
  }

  /** Kennzeichen isActive neu setzen: genau die heute gültige Einstellung ist aktiv */
  static updateActiveStatusSync(): MinijobSetting | null {
    return transaction(() => {
      db().update(minijobSettings).set({ isActive: false }).where(eq(minijobSettings.isActive, true)).run();
      const current = this.currentSettingSync();
      if (!current) return null;
      return db().update(minijobSettings).set({ isActive: true }).where(eq(minijobSettings.id, current.id)).returning().get() ?? null;
    });
  }

  static async updateActiveStatus(): Promise<MinijobSetting | null> {
    return this.updateActiveStatusSync();
  }

  /** Kennzahlen: Anzahl, aktuelle Grenze, zuletzt angelegte */
  static async getStatistics() {
    const total = db().select({ n: count() }).from(minijobSettings).get()?.n ?? 0;
    const active = db().select({ n: count() }).from(minijobSettings).where(eq(minijobSettings.isActive, true)).get()?.n ?? 0;
    const current = await this.getCurrentSetting();

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const recent = withCreator().where(gte(minijobSettings.createdAt, oneYearAgo))
      .orderBy(desc(minijobSettings.createdAt)).limit(10).all().map(attachCreator);

    return {
      overview: { total, active, inactive: total - active, currentLimit: current ? current.monthlyLimit : null },
      current,
      recent
    };
  }

  /** Einstellungen, deren Zeitraum sich mit [startDate, endDate] überschneidet (endDate null = unbegrenzt) */
  static findOverlaps(startDate: string, endDate: string | null, excludeId: number | null = null): MinijobSetting[] {
    const startsInside = validOn(startDate);
    const conditions: SQL[] = [startsInside];
    if (endDate) {
      conditions.push(validOn(endDate));
      conditions.push(and(gte(minijobSettings.validFrom, startDate), lte(minijobSettings.validUntil, endDate)) as SQL);
    }
    const where = excludeId
      ? and(or(...conditions), ne(minijobSettings.id, excludeId))
      : or(...conditions);
    return db().select().from(minijobSettings).where(where).all();
  }

  /** Überschneidung beim Anlegen: nur eine unbefristete frühere Einstellung wird automatisch beendet */
  private static handleOverlapForCreate(overlapping: MinijobSetting[], fromDate: string): Adjustment[] {
    const previousUnlimited = overlapping.find((s) => s.validUntil === null && s.validFrom < fromDate);
    if (overlapping.length !== 1 || !previousUnlimited) {
      throw new AppError('OVERLAPPING_PERIODS', 'Zeitraum überschneidet sich mit bestehenden Einstellungen');
    }
    const newEndDate = DateService.getDateBefore(fromDate);
    db().update(minijobSettings).set({ validUntil: newEndDate }).where(eq(minijobSettings.id, previousUnlimited.id)).run();
    return [{ id: previousUnlimited.id, description: previousUnlimited.description, oldValidUntil: 'unbegrenzt', newValidUntil: newEndDate }];
  }

  /** Beim Löschen: die vorherige Einstellung reicht bis zur nächsten (oder unbegrenzt) */
  private static handleDeletionAdjustment(toDelete: MinijobSetting): Adjustment[] {
    const next = db().select().from(minijobSettings)
      .where(and(gt(minijobSettings.validFrom, toDelete.validFrom), ne(minijobSettings.id, toDelete.id)))
      .orderBy(asc(minijobSettings.validFrom)).get();
    const previous = db().select().from(minijobSettings)
      .where(and(lt(minijobSettings.validFrom, toDelete.validFrom), ne(minijobSettings.id, toDelete.id)))
      .orderBy(desc(minijobSettings.validFrom)).get();
    if (!previous) return [];

    const newValidUntil = next ? DateService.getDateBefore(next.validFrom) : null;
    db().update(minijobSettings).set({ validUntil: newValidUntil }).where(eq(minijobSettings.id, previous.id)).run();
    return [{
      id: previous.id,
      description: previous.description,
      oldValidUntil: previous.validUntil || 'unbegrenzt',
      newValidUntil: newValidUntil || 'unbegrenzt'
    }];
  }
}

export default MinijobService;
