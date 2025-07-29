require('dotenv').config();

// Validation Helper
const requireEnv = (key, defaultValue = null) => {
  const value = process.env[key] || defaultValue;
  if (!value && defaultValue === null) {
    throw new Error(`❌ Environment variable ${key} ist erforderlich`);
  }
  return value;
};

// Sichere JWT Secret Validierung
const validateJWTSecret = (secret, name) => {
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`❌ ${name} muss mindestens 32 Zeichen haben (Production)`);
    } else {
      console.warn(`⚠️ ${name} sollte stärker sein (Development OK)`);
    }
  }
  return secret;
};

const config = {
  // Server
  port: parseInt(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // JWT Configuration
  jwt: {
    secret: validateJWTSecret(
      requireEnv('JWT_SECRET', 'dev_fallback_secret_not_for_production'), 
      'JWT_SECRET'
    ),
    refreshSecret: validateJWTSecret(
      requireEnv('JWT_REFRESH_SECRET', 'dev_fallback_refresh_not_for_production'), 
      'JWT_REFRESH_SECRET'
    ),
    expiresIn: '15m',
    refreshExpiresIn: '7d'
  },
  
  // Database
  database: {
    dialect: process.env.DB_DIALECT || 'sqlite',
    storage: process.env.DB_STORAGE || './database/timetracking.db',
    logging: process.env.DB_LOGGING === 'true' || false
  },
  
  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN ? 
      process.env.CORS_ORIGIN.split(',') : 
      ['http://localhost:3000'],
    credentials: true
  },
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    general: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    login: parseInt(process.env.RATE_LIMIT_LOGIN_MAX) || 5
  },
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info'
};

// Development Info
if (config.nodeEnv === 'development') {
  console.log('🔧 Development Configuration loaded');
  console.log(`📊 Database: ${config.database.dialect} (${config.database.storage})`);
  console.log(`🔐 JWT Secrets: ${config.jwt.secret.length} / ${config.jwt.refreshSecret.length} chars`);
}

module.exports = config;