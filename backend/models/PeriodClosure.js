const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Monatsabschluss: ein Datensatz je (Mitarbeiter, Abrechnungsperiode), solange die
 * Periode abgeschlossen ist. Die Zahlen werden beim Abschluss eingefroren, damit
 * nachträgliche Änderungen an Minijob-Grenzen die ausgezahlten Beträge nicht verändern.
 * Beim Wiedereröffnen wird der Datensatz gelöscht; der Verlauf steht im Änderungsprotokoll.
 */
const PeriodClosure = sequelize.define('PeriodClosure', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'Users', key: 'id' }
  },
  periodStart: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Erster Tag der Abrechnungsperiode'
  },
  periodEnd: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Letzter Tag der Abrechnungsperiode'
  },
  closedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Admin, der abgeschlossen hat'
  },
  closedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  entryCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  totalMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  earningsCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  limitCents: { type: DataTypes.INTEGER, allowNull: false },
  carryInCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  paidCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  carryOutCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
}, {
  tableName: 'PeriodClosures',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['userId', 'periodStart'], name: 'unique_user_period_start' },
    { fields: ['userId', 'periodEnd'] }
  ]
});

module.exports = PeriodClosure;
