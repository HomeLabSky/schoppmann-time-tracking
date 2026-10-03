const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Änderungsprotokoll (Audit-Log).
 *
 * Append-only: Einträge werden nur angelegt, nie geändert oder gelöscht (Hooks
 * unten verhindern das auch für Bulk-Operationen). Es gibt bewusst keine
 * Fremdschlüssel – das Protokoll muss auch dann erhalten bleiben, wenn Benutzer
 * deaktiviert werden. E-Mail-Adressen werden als Momentaufnahme mitgespeichert.
 */
const jsonColumn = (name) => ({
  type: DataTypes.TEXT,
  allowNull: true,
  get() {
    const raw = this.getDataValue(name);
    if (raw == null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  },
  set(value) {
    this.setDataValue(name, value == null ? null : JSON.stringify(value));
  }
});

const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  actorId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Benutzer, der die Änderung ausgelöst hat (NULL = System/Skript)'
  },
  actorEmail: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'system',
    comment: 'E-Mail des Auslösers zum Zeitpunkt der Änderung'
  },
  action: {
    type: DataTypes.STRING(64),
    allowNull: false,
    comment: 'z. B. time_entry.update, period.close, user.update'
  },
  entityType: {
    type: DataTypes.STRING(64),
    allowNull: false
  },
  entityId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  targetUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Betroffener Mitarbeiter (für Filter "Änderungen an Konto X")'
  },
  before: jsonColumn('before'),
  after: jsonColumn('after'),
  meta: jsonColumn('meta')
}, {
  tableName: 'AuditLogs',
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ['createdAt'] },
    { fields: ['targetUserId', 'createdAt'] },
    { fields: ['entityType', 'entityId'] },
    { fields: ['action'] }
  ]
});

const immutable = () => {
  throw new Error('Das Änderungsprotokoll ist unveränderlich');
};
AuditLog.beforeUpdate(immutable);
AuditLog.beforeDestroy(immutable);
AuditLog.beforeBulkUpdate(immutable);
AuditLog.beforeBulkDestroy(immutable);

module.exports = AuditLog;
