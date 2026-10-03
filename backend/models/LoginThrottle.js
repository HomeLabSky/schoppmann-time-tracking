const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Fehlversuche bei der Anmeldung je E-Mail-Adresse (Konto-Sperre, ergänzt die Begrenzung pro IP).
 *
 * Bewusst nach E-Mail-Adresse und nicht nach Benutzer-ID: Auch für nicht vorhandene Adressen wird gezählt
 * und gesperrt. So verrät die Sperre nicht, ob ein Konto existiert.
 */
const LoginThrottle = sequelize.define('LoginThrottle', {
  email: {
    type: DataTypes.STRING,
    primaryKey: true,
    comment: 'Normalisierte E-Mail-Adresse'
  },
  failures: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  lastFailureAt: { type: DataTypes.DATE, allowNull: true },
  lockedUntil: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'LoginThrottles',
  timestamps: false
});

module.exports = LoginThrottle;
