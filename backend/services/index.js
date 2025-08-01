/**
 * ✅ Services Index - Zentrale Service-Exporte
 * Sammelt alle Services für einfache Imports
 */

const TokenService = require('./tokenService');
const DateService = require('./dateService');
const UserService = require('./userService');
const MinijobService = require('./minijobService');
const TimeEntryService = require('./timeEntryService');

module.exports = {
  TokenService,
  DateService,
  UserService,
  MinijobService,
  TimeEntryService
};