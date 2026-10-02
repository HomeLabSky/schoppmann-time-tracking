const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const billing = require('../utils/billing');

// ✅ TimeEntry Model Definition
const TimeEntry = sequelize.define('TimeEntry', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'ID des Mitarbeiters'
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    validate: {
      isDate: true,
      notEmpty: true
    },
    comment: 'Arbeitsdatum (YYYY-MM-DD)'
  },
  startTime: {
    type: DataTypes.TIME,
    allowNull: false,
    validate: {
      notEmpty: true
    },
    comment: 'Startzeit (HH:mm:ss)'
  },
  endTime: {
    type: DataTypes.TIME,
    allowNull: false,
    validate: {
      notEmpty: true
    },
    comment: 'Endzeit (HH:mm:ss)'
  },
  breakMinutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 30,
    validate: {
      min: 0,
      max: 480 // Max 8 Stunden Pause
    },
    comment: 'Pausendauer in Minuten'
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Optionale Beschreibung der Arbeit'
  },
  hourlyRateCents: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Stundensatz in Cent, beim Anlegen eingefroren (spätere Lohnänderungen wirken nicht rückwirkend)'
  },
  workMinutes: {
    type: DataTypes.VIRTUAL,
    get() {
      return billing.workMinutes(this.startTime, this.endTime, this.breakMinutes);
    }
  },
  earningsCents: {
    type: DataTypes.VIRTUAL,
    get() {
      const rate = this.hourlyRateCents ?? billing.DEFAULT_HOURLY_RATE_CENTS;
      return billing.earningsCents(this.workMinutes, rate);
    }
  },
  earnings: {
    type: DataTypes.VIRTUAL,
    get() {
      return billing.toEuros(this.earningsCents);
    }
  }
}, {
  tableName: 'TimeEntries',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['userId', 'date'],
      name: 'unique_user_date'
    },
    {
      fields: ['userId']
    },
    {
      fields: ['date']
    },
    {
      fields: ['userId', 'date']
    }
  ],
  validate: {
    validTimeRange() {
      if (this.startTime && this.endTime) {
        const startMin = this.timeToMinutes(this.startTime);
        const endMin = this.timeToMinutes(this.endTime);

        // Über-Mitternacht-Schichten sind erlaubt, Start = Ende nicht
        if (startMin === endMin) {
          throw new Error('Start- und Endzeit dürfen nicht gleich sein');
        }
      }
    }
  }
});

// ✅ Instance Methods
TimeEntry.prototype.timeToMinutes = function(timeString) {
  return billing.timeToMinutes(timeString);
};

TimeEntry.prototype.formatTime = function(timeString) {
  if (!timeString) return '--:--';
  return timeString.substring(0, 5); // HH:mm
};

TimeEntry.prototype.getFormattedWorkTime = function() {
  const minutes = this.workMinutes;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

TimeEntry.prototype.getFormattedEarnings = function() {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR'
  }).format(this.earnings);
};

TimeEntry.prototype.toSafeJSON = function() {
  const values = Object.assign({}, this.get());
  return {
    ...values,
    startTime: this.formatTime(values.startTime),
    endTime: this.formatTime(values.endTime),
    workTime: this.getFormattedWorkTime(),
    workMinutes: this.workMinutes,
    totalHours: Math.round((this.workMinutes / 60) * 100) / 100,
    hourlyRate: billing.toEuros(this.hourlyRateCents ?? billing.DEFAULT_HOURLY_RATE_CENTS),
    earnings: this.earnings,
    formattedEarnings: this.getFormattedEarnings()
  };
};

// ✅ Format-Validierung der Eingabe (Fachregeln: utils/billing.js → validateEntryRules)
TimeEntry.validateTimeEntry = function(entryData) {
  const errors = [];
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

  if (!entryData.userId) {
    errors.push('Benutzer-ID ist erforderlich');
  }

  if (!entryData.date) {
    errors.push('Datum ist erforderlich');
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(entryData.date)) {
    errors.push('Datum muss im Format YYYY-MM-DD sein');
  }

  if (!entryData.startTime) {
    errors.push('Startzeit ist erforderlich');
  } else if (!timeRegex.test(String(entryData.startTime).substring(0, 5))) {
    errors.push('Startzeit muss im Format HH:mm sein');
  }

  if (!entryData.endTime) {
    errors.push('Endzeit ist erforderlich');
  } else if (!timeRegex.test(String(entryData.endTime).substring(0, 5))) {
    errors.push('Endzeit muss im Format HH:mm sein');
  }

  if (entryData.breakMinutes !== undefined && entryData.breakMinutes !== null) {
    const breakMin = parseInt(entryData.breakMinutes);
    if (isNaN(breakMin) || breakMin < 0 || breakMin > 480) {
      errors.push('Pausendauer muss zwischen 0 und 480 Minuten liegen');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

module.exports = TimeEntry;
