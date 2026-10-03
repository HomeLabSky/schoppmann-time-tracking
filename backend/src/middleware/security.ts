import cors from 'cors';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import config from '../config';
import { AppError } from '../lib/errors';

// CORS Configuration
export const corsOptions: cors.CorsOptions = {
  origin: config.cors.origin,
  credentials: config.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin', 
    'X-Requested-With', 
    'Content-Type', 
    'Accept', 
    'X-CSRF-Protection'
  ],
  exposedHeaders: [
    'X-Request-ID',
    'X-Total-Count',
    'X-Page-Count', 
    'RateLimit-Limit',
    'RateLimit-Remaining',
    'RateLimit-Reset'
  ]
};

// CORS Middleware
export const corsMiddleware = cors(corsOptions);

// Helmet Security Headers
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
    reportOnly: config.nodeEnv === 'development' // In Development nur warnen
  },
  crossOriginEmbedderPolicy: false, // Für lokale Entwicklung
  hsts: {
    maxAge: config.nodeEnv === 'production' ? 31536000 : 0, // HSTS nur in Production
    includeSubDomains: true,
    preload: true
  }
});

// Content-Type Validation Middleware
export const validateContentType = (req: Request, _res: Response, next: NextFunction): void => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.get('Content-Type');
    
    if (!contentType || !contentType.includes('application/json')) {
      next(new AppError('INVALID_CONTENT_TYPE', 'Content-Type muss application/json sein'));
      return;
    }
  }

  next();
};

// Security Headers Middleware
export const securityHeaders = (_req: Request, res: Response, next: NextFunction): void => {
  // Zusätzliche Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Remove Server Header (versteckt Express)
  res.removeHeader('X-Powered-By');
  
  next();
};

