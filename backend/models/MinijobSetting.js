const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { todayString } = require('../utils/clock');
const logger = require('../lib/logger');

// MinijobSetting Model Definition
const MinijobSetting = sequelize.define('MinijobSetting', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  monthlyLimit: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0,
      max: 999999.99
    },
    comment: 'Monatliches Minijob-Limit in Euro'
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: false,
    validate: {
      len: [3, 500]
    },
    comment: 'Beschreibung der Einstellung'
  },
  validFrom: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    validate: {
      isDate: true,
      notEmpty: true
    },
    comment: 'Gültig ab Datum (YYYY-MM-DD)'
  },
  validUntil: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    validate: {
      isDate: true
    },
    comment: 'Gültig bis Datum (YYYY-MM-DD), NULL = unbegrenzt'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Ist diese Einstellung derzeit aktiv?'
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'ID des Admins, der diese Einstellung erstellt hat'
  }
}, {
  tableName: 'MinijobSettings',
  timestamps: true,
  indexes: [
    {
      fields: ['validFrom']
    },
    {
      fields: ['isActive']
    },
    {
      fields: ['validFrom', 'validUntil']
    },
    {
      fields: ['createdBy']
    }
  ],
  validate: {
    validDateRange() {
      if (this.validUntil && this.validFrom >= this.validUntil) {
        throw new Error('Enddatum muss nach dem Startdatum liegen');
      }
    }
  }
});

// ✅ Static Methods

// Helper-Funktion: Aktuelle Minijob-Einstellung ermitteln
MinijobSetting.getCurrentSetting = async function () {
  try {
    const today = todayString();

    return await this.findOne({
      where: {
        validFrom: {
          [Op.lte]: today
        },
        [Op.or]: [
          { validUntil: null },
          { validUntil: { [Op.gte]: today } }
        ]
      },
      order: [['validFrom', 'DESC']]
    });
  } catch (error) {
    logger.warn({ err: error }, 'getCurrentSetting fehlgeschlagen');
    return null;
  }
};

// Kennzeichen isActive neu setzen: genau die heute gültige Einstellung ist aktiv
MinijobSetting.updateActiveStatus = async function () {
  const transaction = await sequelize.transaction();

  try {
    const today = todayString();

    // Alle als inaktiv markieren
    await this.update(
      { isActive: false },
      { where: {}, transaction }
    );

    // Aktuelle Einstellung finden und als aktiv markieren
    const currentSetting = await this.findOne({
      where: {
        validFrom: {
          [Op.lte]: today
        },
        [Op.or]: [
          { validUntil: null },
          { validUntil: { [Op.gte]: today } }
        ]
      },
      order: [['validFrom', 'DESC']],
      transaction
    });

    if (currentSetting) {
      await currentSetting.update({ isActive: true }, { transaction });
    }

    await transaction.commit();
    return currentSetting;
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

module.exports = MinijobSetting;