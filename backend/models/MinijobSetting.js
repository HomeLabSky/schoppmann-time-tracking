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
    comment: 'Beschreibung der Einstellung'
  },
  validFrom: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Gültig ab Datum (YYYY-MM-DD)'
  },
  validUntil: {
    type: DataTypes.DATEONLY,
    allowNull: true,
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
  indexes: [
    {
      fields: ['validFrom']
    },
    {
      fields: ['isActive']
    },
    {
      fields: ['validFrom', 'validUntil']
    }
  ]
});

// Static Methods (aus Ihrer bestehenden database.js)

// Helper-Funktion: Aktuelle Minijob-Einstellung ermitteln
MinijobSetting.getCurrentSetting = async function() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD Format
  
  return await MinijobSetting.findOne({
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
    include: [{
      model: sequelize.models.User, // Wird später durch Relation definiert
      as: 'Creator',
      attributes: ['name', 'email']
    }]
  });
};

// Helper-Funktion: Aktive Einstellungen aktualisieren
MinijobSetting.updateActiveStatus = async function() {
  const today = new Date().toISOString().split('T')[0];
  
  // Alle als inaktiv markieren
  await MinijobSetting.update(
    { isActive: false },
    { where: {} }
  );
  
  // Aktuelle Einstellung finden und als aktiv markieren
  const currentSetting = await MinijobSetting.findOne({
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
  
  if (currentSetting) {
    await currentSetting.update({ isActive: true });
    console.log(`✅ Minijob-Einstellung ${currentSetting.id} ist jetzt aktiv (${currentSetting.monthlyLimit}€)`);
  }
  
  return currentSetting;
};

// Helper-Funktion: Alle Zeiträume validieren und korrigieren
MinijobSetting.validateAndFixPeriods = async function() {
  const allSettings = await MinijobSetting.findAll({
    order: [['validFrom', 'ASC']]
  });
  
  let adjustedCount = 0;
  
  for (let i = 0; i < allSettings.length; i++) {
    const currentSetting = allSettings[i];
    const nextSetting = allSettings[i + 1];
    
    let newValidUntil = null;
    
    if (nextSetting) {
      // Sichere Datums-Berechnung (einen Tag vor dem nächsten Setting)
      const nextDate = new Date(nextSetting.validFrom);
      nextDate.setDate(nextDate.getDate() - 1);
      newValidUntil = nextDate.toISOString().split('T')[0];
    }
    
    if (currentSetting.validUntil !== newValidUntil) {
      await currentSetting.update({ validUntil: newValidUntil });
      adjustedCount++;
    }
  }
  
  console.log(`✅ MinijobSetting Zeiträume validiert: ${adjustedCount} Anpassungen`);
  return adjustedCount;
};

// Static Helper: Datums-Berechnung (einen Tag vor dem gegebenen Datum)
MinijobSetting.getDateBefore = function(dateString) {
  const date = new Date(dateString + 'T00:00:00.000Z'); // UTC um Zeitzone-Probleme zu vermeiden
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().split('T')[0];
};

module.exports = MinijobSetting;