const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../config/database');

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
    const today = new Date().toISOString().split('T')[0];

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
    console.warn('getCurrentSetting Fehler:', error.message);
    return null;
  }
};

// Helper-Funktion: Aktive Einstellungen aktualisieren
MinijobSetting.updateActiveStatus = async function () {
  const transaction = await sequelize.transaction();

  try {
    const today = new Date().toISOString().split('T')[0];

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
      console.log(`✅ Minijob-Einstellung ${currentSetting.id} ist jetzt aktiv (${currentSetting.monthlyLimit}€)`);
    }

    await transaction.commit();
    return currentSetting;
  } catch (error) {
    await transaction.rollback();
    console.warn('updateActiveStatus Fehler:', error.message);
    return null;
  }
};

// ✅ Instance Methods
MinijobSetting.prototype.isCurrentlyActive = function () {
  const today = new Date().toISOString().split('T')[0];
  return this.validFrom <= today &&
    (this.validUntil === null || this.validUntil >= today);
};

MinijobSetting.prototype.getFormattedLimit = function () {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR'
  }).format(this.monthlyLimit);
};

MinijobSetting.prototype.getFormattedPeriod = function () {
  const start = new Date(this.validFrom + 'T12:00:00.000Z').toLocaleDateString('de-DE');
  const end = this.validUntil ?
    new Date(this.validUntil + 'T12:00:00.000Z').toLocaleDateString('de-DE') :
    'unbegrenzt';

  return `${start} - ${end}`;
};

// ✅ Validation Helper
MinijobSetting.validateSettingData = function (settingData) {
  const errors = [];

  if (!settingData.monthlyLimit || settingData.monthlyLimit < 0 || settingData.monthlyLimit > 999999.99) {
    errors.push('Monatliches Limit muss zwischen 0 und 999.999,99€ liegen');
  }

  if (!settingData.description || settingData.description.trim().length < 3 || settingData.description.trim().length > 500) {
    errors.push('Beschreibung muss zwischen 3 und 500 Zeichen haben');
  }

  if (!settingData.validFrom) {
    errors.push('Startdatum ist erforderlich');
  } else {
    const startDate = new Date(settingData.validFrom + 'T00:00:00.000Z');
    if (isNaN(startDate.getTime())) {
      errors.push('Ungültiges Startdatum');
    }
  }

  if (settingData.validUntil) {
    const endDate = new Date(settingData.validUntil + 'T00:00:00.000Z');
    if (isNaN(endDate.getTime())) {
      errors.push('Ungültiges Enddatum');
    } else if (settingData.validFrom && settingData.validUntil <= settingData.validFrom) {
      errors.push('Enddatum muss nach dem Startdatum liegen');
    }
  }

  if (!settingData.createdBy) {
    errors.push('Ersteller-ID ist erforderlich');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// Static Helper: Datums-Berechnung (einen Tag vor dem gegebenen Datum)
MinijobSetting.getDateBefore = function (dateString) {
  try {
    if (!dateString) {
      throw new Error('Datum ist erforderlich');
    }

    const date = new Date(dateString + 'T00:00:00.000Z');
    if (isNaN(date.getTime())) {
      throw new Error('Ungültiges Datum');
    }

    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().split('T')[0];
  } catch (error) {
    throw new Error(`Datums-Berechnung fehlgeschlagen: ${error.message}`);
  }
};

module.exports = MinijobSetting;