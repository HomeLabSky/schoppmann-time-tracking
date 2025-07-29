const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database'); // KORRIGIERT: Korrekte Import-Pfad

// ✅ KORRIGIERT: User Model Definition mit korrekter sequelize Integration
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
  // KORRIGIERT: Model-Optionen hinzugefügt
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

// ✅ KORRIGIERT: Hooks mit Error Handling
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

// ✅ KORRIGIERT: Instance Methods mit Error Handling
User.prototype.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error(`Passwort-Vergleich fehlgeschlagen: ${error.message}`);
  }
};

User.prototype.toSafeJSON = function() {
  try {
    const values = Object.assign({}, this.get());
    delete values.password; // Passwort aus JSON-Output entfernen
    return values;
  } catch (error) {
    throw new Error(`JSON-Konvertierung fehlgeschlagen: ${error.message}`);
  }
};

// ✅ KORRIGIERT: Static Methods mit Error Handling
User.findByEmail = function(email) {
  try {
    if (!email) {
      throw new Error('Email ist erforderlich');
    }
    return this.findOne({ where: { email } });
  } catch (error) {
    throw new Error(`Benutzer-Suche per Email fehlgeschlagen: ${error.message}`);
  }
};

User.findActiveUsers = function() {
  try {
    return this.findAll({ 
      where: { isActive: true },
      attributes: { exclude: ['password'] }
    });
  } catch (error) {
    throw new Error(`Aktive Benutzer-Suche fehlgeschlagen: ${error.message}`);
  }
};

// ✅ KORRIGIERT: Validation Helper
User.validateUserData = function(userData, operation = 'create') {
  const errors = [];

  if (operation === 'create') {
    if (!userData.email) errors.push('Email ist erforderlich');
    if (!userData.password) errors.push('Passwort ist erforderlich');
    if (!userData.name) errors.push('Name ist erforderlich');
  }

  // Email Format prüfen
  if (userData.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userData.email)) {
      errors.push('Ungültiges Email-Format');
    }
  }

  // Name prüfen
  if (userData.name) {
    if (userData.name.length < 2 || userData.name.length > 50) {
      errors.push('Name muss zwischen 2 und 50 Zeichen haben');
    }
  }

  // Passwort prüfen
  if (userData.password && (operation === 'create' || userData.password.length > 0)) {
    if (userData.password.length < 8) {
      errors.push('Passwort muss mindestens 8 Zeichen haben');
    }
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(userData.password)) {
      errors.push('Passwort muss Groß-, Kleinbuchstaben und eine Zahl enthalten');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

module.exports = User;