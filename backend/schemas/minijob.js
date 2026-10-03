const { z, integer, euro, isoDate, Pagination, timestamp } = require('./common');

const MinijobSettingBody = z.object({
  monthlyLimit: euro('Monatliches Limit', 999999.99),
  description: z.string({ error: 'Beschreibung ist erforderlich' })
    .trim()
    .min(3, 'Beschreibung muss zwischen 3 und 500 Zeichen haben')
    .max(500, 'Beschreibung muss zwischen 3 und 500 Zeichen haben')
    .regex(/^[a-zA-ZäöüÄÖÜß0-9\s\-_.,!?()]+$/, 'Beschreibung enthält unerlaubte Zeichen'),
  // Rückwirkend erlaubt: abgeschlossene Perioden haben ihre Grenze eingefroren, betroffen sind nur offene
  validFrom: isoDate('Gültig ab'),
  validUntil: z.union([isoDate('Gültig bis'), z.null(), z.literal('')]).optional()
    .transform((value) => value || null)
    .describe('Leer/null = unbegrenzt')
}).refine((body) => !body.validUntil || body.validUntil > body.validFrom, {
  message: 'Enddatum muss nach dem Startdatum liegen',
  path: ['validUntil']
});

const MinijobListQuery = z.object({
  page: integer('Seite', { min: 1 }).optional(),
  limit: integer('Anzahl', { min: 1, max: 200 }).optional(),
  status: z.enum(['active', 'inactive', '']).optional()
});

const Creator = z.object({ name: z.string(), email: z.string() }).nullable().optional();

const MinijobSetting = z.object({
  id: z.number().int(),
  monthlyLimit: z.union([z.number(), z.string()]).describe('Grenze in Euro'),
  description: z.string(),
  validFrom: z.string(),
  validUntil: z.string().nullable(),
  isActive: z.boolean(),
  createdBy: z.number().int(),
  createdAt: timestamp(),
  updatedAt: timestamp(),
  Creator
}).meta({ id: 'MinijobSetting', description: 'Minijob-Verdienstgrenze mit Gültigkeitszeitraum' });

const Adjustment = z.object({
  id: z.number().int(),
  description: z.string(),
  validFrom: z.string().optional(),
  oldValidUntil: z.string().nullable(),
  newValidUntil: z.string().nullable()
}).meta({ id: 'MinijobAdjustment', description: 'Automatisch angepasster Zeitraum einer anderen Grenze' });

const SettingListData = z.object({ settings: z.array(MinijobSetting), pagination: Pagination });
const SettingData = z.object({ setting: MinijobSetting });
const CreateSettingData = z.object({ setting: MinijobSetting, autoAdjustedSettings: z.array(Adjustment) });
const DeleteSettingData = z.object({
  deletedSetting: z.object({ id: z.number().int(), description: z.string(), validFrom: z.string(), validUntil: z.string().nullable() }),
  adjustedSettings: z.array(Adjustment)
});
const RecalculateData = z.object({ adjustedCount: z.number().int(), adjustments: z.array(Adjustment) });
const RefreshStatusData = z.object({ currentSetting: MinijobSetting.omit({ Creator: true }).nullable() });
const MinijobStats = z.object({
  overview: z.object({
    total: z.number().int(),
    active: z.number().int(),
    inactive: z.number().int(),
    currentLimit: z.union([z.number(), z.string()]).nullable()
  }),
  current: MinijobSetting.nullable(),
  recent: z.array(MinijobSetting)
});

module.exports = {
  MinijobSettingBody,
  MinijobListQuery,
  MinijobSetting,
  SettingListData,
  SettingData,
  CreateSettingData,
  DeleteSettingData,
  RecalculateData,
  RefreshStatusData,
  MinijobStats
};
