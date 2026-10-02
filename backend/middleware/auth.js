const jwt = require('jsonwebtoken');
const config = require('../config'); // Ihre bestehende config nutzen

// ✅ JWT Token Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log('❌ Auth: Kein Token bereitgestellt');
    return res.status(401).json({ 
      error: 'Access Token erforderlich',
      code: 'MISSING_TOKEN'
    });
  }

  jwt.verify(token, config.jwt.secret, (err, user) => {
    if (err) {
      console.log('❌ Auth: Token verification failed:', err.message);
      return res.status(403).json({ 
        error: 'Ungültiger Token',
        code: 'INVALID_TOKEN'
      });
    }
    
    // User-Info in Request speichern
    req.user = user;
    
    if (config.nodeEnv === 'development') {
      console.log(`✅ Auth: User ${user.email} (${user.role}) authenticated`);
    }
    
    next();
  });
};

// ✅ Admin-only Access Middleware
const requireAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log('❌ Admin: Kein Token bereitgestellt');
    return res.status(401).json({ 
      error: 'Access Token erforderlich',
      code: 'MISSING_TOKEN'
    });
  }

  jwt.verify(token, config.jwt.secret, (err, user) => {
    if (err) {
      console.log('❌ Admin: Token verification failed:', err.message);
      return res.status(403).json({ 
        error: 'Ungültiger Token',
        code: 'INVALID_TOKEN'
      });
    }

    // ✅ Admin-Rolle prüfen
    if (user.role !== 'admin') {
      console.log(`❌ Admin: Access denied for user ${user.email} - Role: ${user.role}`);
      return res.status(403).json({
        error: 'Administratorrechte erforderlich',
        code: 'INSUFFICIENT_PERMISSIONS',
        userRole: user.role
      });
    }

    req.user = user;
    
    if (config.nodeEnv === 'development') {
      console.log(`✅ Admin: User ${user.email} authorized`);
    }
    
    next();
  });
};

// ✅ Employee-only Access Middleware (für zukünftige Features)
const requireEmployee = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      error: 'Access Token erforderlich',
      code: 'MISSING_TOKEN'
    });
  }

  jwt.verify(token, config.jwt.secret, (err, user) => {
    if (err) {
      return res.status(403).json({ 
        error: 'Ungültiger Token',
        code: 'INVALID_TOKEN'
      });
    }

    // Employee oder Admin berechtigt
    if (user.role !== 'mitarbeiter' && user.role !== 'admin') {
      console.log(`❌ Employee: Access denied for user ${user.email} - Role: ${user.role}`);
      return res.status(403).json({
        error: 'Mitarbeiter-Rechte erforderlich',
        code: 'INSUFFICIENT_PERMISSIONS',
        userRole: user.role
      });
    }

    req.user = user;
    
    if (config.nodeEnv === 'development') {
      console.log(`✅ Employee: User ${user.email} (${user.role}) authorized`);
    }
    
    next();
  });
};

module.exports = { 
  authenticateToken, 
  requireAdmin, 
  requireEmployee
};