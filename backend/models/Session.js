const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Anmelde-Sitzung (eine je Browser-Anmeldung).
 *
 * Das Erneuerungs-Token wird nie im Klartext gespeichert, nur als HMAC-Prüfwert. Bei jeder Erneuerung
 * wird das Token rotiert; der vorherige Prüfwert bleibt für die Erkennung von Wiederverwendung erhalten
 * (ein bereits benutztes Token taucht erneut auf = vermutlich gestohlen → Sitzung wird gesperrt).
 */
const Session = sequelize.define('Session', {
  id: {
    type: DataTypes.STRING(36),
    primaryKey: true,
    comment: 'Sitzungs-ID (UUID); steckt auch im Zugriffs-Token'
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'Users', key: 'id' },
    onDelete: 'CASCADE'
  },
  refreshHash: { type: DataTypes.STRING(64), allowNull: false },
  previousHash: { type: DataTypes.STRING(64), allowNull: true },
  rotatedAt: { type: DataTypes.DATE, allowNull: true },
  lastUsedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  expiresAt: { type: DataTypes.DATE, allowNull: false, comment: 'Ablauf des Erneuerungs-Tokens (gleitend)' },
  absoluteExpiresAt: { type: DataTypes.DATE, allowNull: false, comment: 'Späteste Gültigkeit der Sitzung' },
  revokedAt: { type: DataTypes.DATE, allowNull: true },
  revokedReason: { type: DataTypes.STRING(64), allowNull: true },
  ip: { type: DataTypes.STRING(64), allowNull: true },
  userAgent: { type: DataTypes.STRING(255), allowNull: true }
}, {
  tableName: 'Sessions',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['revokedAt'] },
    { fields: ['absoluteExpiresAt'] }
  ]
});

module.exports = Session;
