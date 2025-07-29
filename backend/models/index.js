const { sequelize } = require('../config/database');
const User = require('./User');
const MinijobSetting = require('./MinijobSetting');

const UserModel = User.init ? User : sequelize.define('User', User.rawAttributes, User.options);
const MinijobSettingModel = MinijobSetting.init ? MinijobSetting : sequelize.define('MinijobSetting', MinijobSetting.rawAttributes, MinijobSetting.options);

// ✅ Beziehungen zwischen Models definieren
UserModel.hasMany(MinijobSettingModel, {
  foreignKey: 'createdBy',
  as: 'CreatedMinijobSettings'
});

MinijobSettingModel.belongsTo(UserModel, {
  foreignKey: 'createdBy',
  as: 'Creator'
});

UserModel.findByEmail = function (email) {
  return this.findOne({ where: { email } });
};

UserModel.findActiveUsers = function () {
  return this.findAll({ where: { isActive: true } });
};

MinijobSettingModel.getCurrentSetting = async function () {
  const { Op } = require('sequelize');
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
    order: [['validFrom', 'DESC']],
    include: [{
      model: UserModel,
      as: 'Creator',
      attributes: ['name', 'email']
    }]
  });
};

MinijobSettingModel.updateActiveStatus = async function () {
  const { Op } = require('sequelize');
  const today = new Date().toISOString().split('T')[0];

  // Alle als inaktiv markieren
  await this.update(
    { isActive: false },
    { where: {} }
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
    order: [['validFrom', 'DESC']]
  });

  if (currentSetting) {
    await currentSetting.update({ isActive: true });
    console.log(`✅ Minijob-Einstellung ${currentSetting.id} ist jetzt aktiv (${currentSetting.monthlyLimit}€)`);
  }

  return currentSetting;
};

MinijobSettingModel.getDateBefore = function (dateString) {
  const date = new Date(dateString + 'T00:00:00.000Z');
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().split('T')[0];
};

// ✅ Datenbank initialisieren (ersetzt die alte database.js Funktion)
const initDatabase = async () => {
  try {
    console.log('🔄 Initialisiere Datenbank...');

    // Verbindung testen
    await sequelize.authenticate();
    console.log('✅ Datenbankverbindung erfolgreich etabliert');

    // Tabellen synchronisieren
    await sequelize.sync();
    console.log('✅ Datenbank-Tabellen synchronisiert');

    // Aktive Minijob-Einstellungen beim Start aktualisieren
    await MinijobSetting.updateActiveStatus();
    console.log('✅ Minijob-Einstellungen Status aktualisiert');

    console.log('🎉 Datenbank erfolgreich initialisiert');
    return true;
  } catch (error) {
    console.error('❌ Datenbankfehler:', error);
    throw error;
  }
};

// ✅ Alle Models und Funktionen exportieren
module.exports = {
  // Models (korrigierte Namen)
  User: UserModel,
  MinijobSetting: MinijobSettingModel,

  // Database
  sequelize,
  initDatabase,

  // Helper (für backwards compatibility)
  models: {
    User: UserModel,
    MinijobSetting: MinijobSettingModel
  }
};