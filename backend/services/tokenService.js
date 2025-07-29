const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * ✅ Token Service - Zentralisierte JWT Token-Verwaltung
 * Enthält alle Token-bezogenen Operationen
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

  /**
   * Verifiziert einen Access Token
   * @param {string} token - JWT Access Token
   * @returns {Object} Decoded Token Payload
   * @throws {Error} Bei ungültigem Token
   */
  static verifyAccessToken(token) {
    try {
      return jwt.verify(token, config.jwt.secret, {
        issuer: 'schoppmann-timetracking',
        audience: 'schoppmann-users'
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('TOKEN_EXPIRED');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('TOKEN_INVALID');
      } else {
        throw new Error('TOKEN_VERIFICATION_FAILED');
      }
    }
  }

  /**
   * Verifiziert einen Refresh Token
   * @param {string} token - JWT Refresh Token
   * @returns {Object} Decoded Token Payload
   * @throws {Error} Bei ungültigem Token
   */
  static verifyRefreshToken(token) {
    try {
      const decoded = jwt.verify(token, config.jwt.refreshSecret, {
        issuer: 'schoppmann-timetracking',
        audience: 'schoppmann-users'
      });

      if (decoded.tokenType !== 'refresh') {
        throw new Error('INVALID_TOKEN_TYPE');
      }

      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('REFRESH_TOKEN_EXPIRED');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('REFRESH_TOKEN_INVALID');
      } else {
        throw new Error('REFRESH_TOKEN_VERIFICATION_FAILED');
      }
    }
  }

  /**
   * Dekodiert Token ohne Verifikation (für Debugging)
   * @param {string} token - JWT Token
   * @returns {Object} Decoded Token Payload
   */
  static decodeToken(token) {
    try {
      return jwt.decode(token, { complete: true });
    } catch (error) {
      return null;
    }
  }

  /**
   * Extrahiert Token aus Authorization Header
   * @param {string} authHeader - Authorization Header Wert
   * @returns {string|null} Extrahierter Token oder null
   */
  static extractTokenFromHeader(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7); // Remove 'Bearer ' prefix
  }

  /**
   * Prüft ob Token bald abläuft (innerhalb der nächsten 5 Minuten)
   * @param {Object} decodedToken - Dekodierter Token
   * @returns {boolean} True wenn Token bald abläuft
   */
  static isTokenExpiringSoon(decodedToken) {
    if (!decodedToken.exp) return false;
    
    const expirationTime = decodedToken.exp * 1000; // Convert to milliseconds
    const currentTime = Date.now();
    const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    return (expirationTime - currentTime) < fiveMinutes;
  }

  /**
   * Erstellt Token-Info Objekt für Response
   * @param {Object} tokens - { accessToken, refreshToken }
   * @param {Object} user - User-Objekt
   * @returns {Object} Token-Info für Frontend
   */
  static createTokenResponse(tokens, user) {
    const decodedAccess = this.decodeToken(tokens.accessToken);
    
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: 'Bearer',
      expiresIn: config.jwt.expiresIn,
      expiresAt: decodedAccess ? new Date(decodedAccess.payload.exp * 1000).toISOString() : null,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive
      }
    };
  }

  /**
   * Validiert Token-Payload Struktur
   * @param {Object} payload - Token Payload
   * @returns {boolean} True wenn Payload gültig ist
   */
  static validateTokenPayload(payload) {
    const requiredFields = ['userId', 'email', 'role'];
    return requiredFields.every(field => payload && payload[field]);
  }

  /**
   * Erstellt einen temporären Token (z.B. für Password Reset)
   * @param {Object} payload - Token Payload
   * @param {string} expiresIn - Gültigkeitsdauer (z.B. '1h')
   * @returns {string} JWT Token
   */
  static generateTemporaryToken(payload, expiresIn = '1h') {
    return jwt.sign(
      {
        ...payload,
        tokenType: 'temporary',
        timestamp: Date.now()
      },
      config.jwt.secret,
      { 
        expiresIn,
        issuer: 'schoppmann-timetracking',
        audience: 'schoppmann-temp'
      }
    );
  }

  /**
   * Development Helper: Token-Informationen für Debugging
   * @param {string} token - JWT Token
   * @returns {Object} Token Debug-Informationen
   */
  static getTokenDebugInfo(token) {
    if (config.nodeEnv !== 'development') {
      return { error: 'Debug info nur in Development verfügbar' };
    }

    try {
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded) return { error: 'Token kann nicht dekodiert werden' };

      return {
        header: decoded.header,
        payload: {
          ...decoded.payload,
          // Sensible Daten ausblenden
          exp: decoded.payload.exp ? new Date(decoded.payload.exp * 1000).toISOString() : null,
          iat: decoded.payload.iat ? new Date(decoded.payload.iat * 1000).toISOString() : null
        },
        signature: decoded.signature ? '***HIDDEN***' : null,
        isExpired: decoded.payload.exp ? (decoded.payload.exp * 1000) < Date.now() : false,
        timeUntilExpiry: decoded.payload.exp ? 
          Math.max(0, Math.round((decoded.payload.exp * 1000 - Date.now()) / 1000)) : null
      };
    } catch (error) {
      return { error: error.message };
    }
  }
}

module.exports = TokenService;