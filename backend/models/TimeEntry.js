const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../config/database');

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
  workMinutes: {
    type: DataTypes.VIRTUAL,
    get() {
      const start = this.startTime;
      const end = this.endTime;
      const breakMin = this.breakMinutes || 0;
      
      if (!start || !end) return 0;
      
      // Zeit-Strings zu Minuten konvertieren
      const startMinutes = this.timeToMinutes(start);
      const endMinutes = this.timeToMinutes(end);
      
      let totalMinutes = endMinutes - startMinutes;
      if (totalMinutes < 0) totalMinutes += 24 * 60; // Über Mitternacht
      
      return Math.max(0, totalMinutes - breakMin);
    }
  },
  earnings: {
    type: DataTypes.VIRTUAL,
    get() {
      const workMin = this.workMinutes;
      const hourlyRate = this.User?.stundenlohn || 12.00;
      return Math.round((workMin / 60) * hourlyRate * 100) / 100;
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
        
        // Erlauben Über-Mitternacht-Schichten, aber mindestens 1 Stunde
        if (startMin === endMin) {
          throw new Error('Start- und Endzeit dürfen nicht gleich sein');
        }
      }
    }
  }
});

// ✅ Instance Methods
TimeEntry.prototype.timeToMinutes = function(timeString) {
  if (!timeString) return 0;
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + (minutes || 0);
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
    earnings: this.earnings,
    formattedEarnings: this.getFormattedEarnings()
  };
};

// ✅ Static Methods
TimeEntry.findByUserAndMonth = async function(userId, year, month) {
  try {
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]; // Letzter Tag des Monats

    return await this.findAll({
      where: {
        userId,
        date: {
          [Op.between]: [startDate, endDate]
        }
      },
      include: [{
        model: require('./User'),
        as: 'User',
        attributes: ['name', 'email', 'stundenlohn']
      }],
      order: [['date', 'ASC']]
    });
  } catch (error) {
    throw new Error(`Zeiteinträge abrufen fehlgeschlagen: ${error.message}`);
  }
};

TimeEntry.calculateMonthlyStats = async function(userId, year, month) {
  try {
    const entries = await this.findByUserAndMonth(userId, year, month);
    
    let totalMinutes = 0;
    let totalEarnings = 0;
    
    entries.forEach(entry => {
      totalMinutes += entry.workMinutes;
      totalEarnings += entry.earnings;
    });
    
    const totalHours = Math.round((totalMinutes / 60) * 100) / 100;
    
    return {
      entries,
      totalMinutes,
      totalHours,
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      entryCount: entries.length,
      averageHoursPerDay: entries.length > 0 ? Math.round((totalHours / entries.length) * 100) / 100 : 0
    };
  } catch (error) {
    throw new Error(`Monatsstatistiken berechnen fehlgeschlagen: ${error.message}`);
  }
};

TimeEntry.validateTimeEntry = function(entryData) {
  const errors = [];
  
  if (!entryData.userId) {
    errors.push('Benutzer-ID ist erforderlich');
  }
  
  if (!entryData.date) {
    errors.push('Datum ist erforderlich');
  } else {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(entryData.date)) {
      errors.push('Datum muss im Format YYYY-MM-DD sein');
    }
  }
  
  if (!entryData.startTime) {
    errors.push('Startzeit ist erforderlich');
  } else {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(entryData.startTime)) {
      errors.push('Startzeit muss im Format HH:mm sein');
    }
  }
  
  if (!entryData.endTime) {
    errors.push('Endzeit ist erforderlich');
  } else {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(entryData.endTime)) {
      errors.push('Endzeit muss im Format HH:mm sein');
    }
  }
  
  if (entryData.breakMinutes !== undefined) {
    const breakMin = parseInt(entryData.breakMinutes);
    if (isNaN(breakMin) || breakMin < 0 || breakMin > 480) {
      errors.push('Pausendauer muss zwischen 0 und 480 Minuten liegen');
    }
  }
  
  // Zeit-Validierung
  if (entryData.startTime && entryData.endTime) {
    const startParts = entryData.startTime.split(':');
    const endParts = entryData.endTime.split(':');
    const startMin = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
    const endMin = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
    
    if (startMin === endMin) {
      errors.push('Start- und Endzeit dürfen nicht gleich sein');
    }
    
    // Mindestarbeitszeit 15 Minuten (auch über Mitternacht)
    let workTime = endMin - startMin;
    if (workTime < 0) workTime += 24 * 60; // Über Mitternacht
    if (workTime < 15) {
      errors.push('Mindestarbeitszeit beträgt 15 Minuten');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

module.exports = TimeEntry;