const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');

// User Model Definition
const User = sequelize.define('User', {
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('admin', 'mitarbeiter'),
    allowNull: false,
    defaultValue: 'mitarbeiter'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  stundenlohn: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: true,
    defaultValue: 12.00,
    comment: 'Stundenlohn in Euro'
  },
  abrechnungStart: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    validate: {
      min: 1,
      max: 31
    },
    comment: 'Start-Tag des Abrechnungszeitraums'
  },
  abrechnungEnde: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 31,
    validate: {
      min: 1,
      max: 31
    },
    comment: 'End-Tag des Abrechnungszeitraums'
  },
  lohnzettelEmail: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isEmail: true
    },
    comment: 'E-Mail-Adresse für Lohnzettel-Versand'
  }
}, {
  tableName: 'Users',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['email']
    },
    {
      fields: ['role']
    },
    {
      fields: ['isActive']
    }
  ]
});

// Hooks für Passwort-Hashing
User.beforeCreate(async (user, options) => {
  try {
    if (user.password) {
      user.password = await bcrypt.hash(user.password, 10);
    }
  } catch (error) {
    throw new Error(`Passwort-Hashing fehlgeschlagen: ${error.message}`);
  }
});

User.beforeUpdate(async (user, options) => {
  try {
    if (user.changed('password') && user.password) {
      user.password = await bcrypt.hash(user.password, 10);
    }
  } catch (error) {
    throw new Error(`Passwort-Update fehlgeschlagen: ${error.message}`);
  }
});

// Instance Methods
User.prototype.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error(`Passwort-Vergleich fehlgeschlagen: ${error.message}`);
  }
};

User.prototype.toSafeJSON = function() {
  const values = Object.assign({}, this.get());
  delete values.password; // Passwort nie ausliefern
  // Frisch angelegte Konten kennen nicht gesetzte Felder noch nicht: einheitlich null statt fehlend
  values.lohnzettelEmail = values.lohnzettelEmail ?? null;
  values.stundenlohn = values.stundenlohn ?? null;
  return values;
};

module.exports = User;