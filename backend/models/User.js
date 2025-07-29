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
});

// Passwort hashen vor dem Speichern (Hook aus Ihrer database.js)
User.beforeCreate(async (user) => {
  if (user.password) {
    user.password = await bcrypt.hash(user.password, 10);
  }
});

// Passwort hashen vor dem Update (falls Passwort geändert wird)
User.beforeUpdate(async (user) => {
  if (user.changed('password') && user.password) {
    user.password = await bcrypt.hash(user.password, 10);
  }
});

// Instance Methods für bessere Nutzbarkeit
User.prototype.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

User.prototype.toSafeJSON = function() {
  const values = Object.assign({}, this.get());
  delete values.password; // Passwort aus JSON-Output entfernen
  return values;
};

// Static Methods
User.findByEmail = function(email) {
  return this.findOne({ where: { email } });
};

User.findActiveUsers = function() {
  return this.findAll({ where: { isActive: true } });
};

module.exports = User;