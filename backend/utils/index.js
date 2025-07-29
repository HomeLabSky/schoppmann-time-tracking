/**
 * ✅ Utils Index - Zentrale Utility-Exporte
 * Sammelt alle Utils für einfache Imports
 */

const responses = require('./responses');
const constants = require('./constants');
const errorHandler = require('./errorHandler');

module.exports = {
  // Response Utilities
  ...responses,
  
  // Constants
  ...constants,
  
  // Error Handling
  ...errorHandler,
  
  // Grouped Exports (für spezifische Imports)
  responses,
  constants,
  errorHandler
};