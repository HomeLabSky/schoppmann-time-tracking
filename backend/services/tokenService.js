const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * ✅ Token Service - JWT-Erzeugung
 *
 * Die Verifikation läuft bewusst über `jwt.verify` in middleware/auth.js bzw.
 * routes/auth.js (bereits ausgegebene Tokens ohne issuer/audience bleiben gültig).
 */
class TokenService {
  /**
   * Generiert Access- und Refresh-Token für einen User
   * @param {Object} user - User-Objekt aus der Datenbank
   * @returns {Object} { accessToken, refreshToken }
   */
  static generateTokens(user) {
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      isActive: user.isActive
    };

    const accessToken = jwt.sign(
      payload,
      config.jwt.secret,
      {
        expiresIn: config.jwt.expiresIn,
        issuer: 'schoppmann-timetracking',
        audience: 'schoppmann-users'
      }
    );

    const refreshToken = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        tokenType: 'refresh'
      },
      config.jwt.refreshSecret,
      {
        expiresIn: config.jwt.refreshExpiresIn,
        issuer: 'schoppmann-timetracking',
        audience: 'schoppmann-users'
      }
    );

    return { accessToken, refreshToken };
  }
}

module.exports = TokenService;
