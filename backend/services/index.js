/**
 * ✅ Services Index - Zentrale Service-Exporte
 * Sammelt alle Services für einfache Imports
 */

const DateService = require('./dateService');
const UserService = require('./userService');
const SessionService = require('./sessionService');
const AuditService = require('./auditService');
const MinijobService = require('./minijobService');
const TimeEntryService = require('./timeEntryService');
const PeriodService = require('./periodService');

module.exports = {
  DateService,
  UserService,
  SessionService,
  AuditService,
  MinijobService,
  TimeEntryService,
  PeriodService
};
