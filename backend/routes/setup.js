const express = require('express');
const { User } = require('../models');
const config = require('../config');

const router = express.Router();

// ✅ ERSTEN ADMIN ERSTELLEN (Öffentliche Setup-Route)
router.get('/create-first-admin', async (req, res) => {
  try {
    // Prüfen ob bereits ein Admin existiert
    const existingAdmin = await User.findOne({ where: { role: 'admin' } });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        error: 'Admin bereits vorhanden',
        code: 'ADMIN_EXISTS',
        data: {
          existingAdmin: {
            email: existingAdmin.email,
            name: existingAdmin.name,
            role: existingAdmin.role,
            createdAt: existingAdmin.createdAt
          }
        }
      });
    }

    // Ersten Admin erstellen
    const admin = await User.create({
      email: 'admin@schoppmann.de',
      password: 'Admin123!',
      name: 'Administrator',
      role: 'admin',
      isActive: true
    });

    console.log('🔑 Erster Admin wurde über Setup-Route erstellt!');

    res.json({
      success: true,
      message: 'Erster Admin erfolgreich erstellt',
      data: {
        admin: admin.toSafeJSON(),
        loginCredentials: {
          email: 'admin@schoppmann.de',
          password: 'Admin123!',
          loginUrl: `${req.protocol}://${req.get('host')}/login`
        },
        nextSteps: [
          '1. Loggen Sie sich mit den oben genannten Credentials ein',
          '2. Ändern Sie sofort das Standard-Passwort',
          '3. Erstellen Sie weitere Benutzer nach Bedarf',
          '4. Diese Setup-Route wird nach dem ersten Login automatisch deaktiviert'
        ]
      }
    });
  } catch (error) {
    console.error('Fehler beim Erstellen des ersten Admins:', error);
    res.status(500).json({ 
      success: false,
      error: 'Admin konnte nicht erstellt werden',
      code: 'ADMIN_CREATE_ERROR',
      details: config.nodeEnv === 'development' ? error.message : undefined
    });
  }
});

// ✅ SYSTEM STATUS PRÜFEN (Öffentlich)
router.get('/status', async (req, res) => {
  try {
    const totalUsers = await User.count();
    const adminCount = await User.count({ where: { role: 'admin' } });
    const activeUsers = await User.count({ where: { isActive: true } });

    const systemStatus = {
      isInitialized: adminCount > 0,
      requiresSetup: adminCount === 0,
      userStats: {
        total: totalUsers,
        admins: adminCount,
        active: activeUsers
      },
      environment: config.nodeEnv,
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      message: 'System-Status erfolgreich geladen',
      data: systemStatus
    });
  } catch (error) {
    console.error('Fehler beim Laden des System-Status:', error);
    res.status(500).json({
      success: false,
      error: 'System-Status konnte nicht geladen werden',
      code: 'SYSTEM_STATUS_ERROR'
    });
  }
});

// ✅ DATENBANK-GESUNDHEITS-CHECK (Öffentlich)
router.get('/health', async (req, res) => {
  try {
    // Datenbankverbindung testen
    await User.findOne({ limit: 1 });
    
    const healthCheck = {
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      environment: config.nodeEnv
    };

    res.json({
      success: true,
      message: 'System ist gesund',
      data: healthCheck
    });
  } catch (error) {
    console.error('Health Check fehlgeschlagen:', error);
    res.status(503).json({
      success: false,
      error: 'System ist nicht gesund',
      code: 'SYSTEM_UNHEALTHY',
      data: {
        status: 'unhealthy',
        database: 'disconnected',
        error: config.nodeEnv === 'development' ? error.message : 'Database connection failed'
      }
    });
  }
});

// ✅ SETUP-INFORMATIONEN (Öffentlich)
router.get('/info', async (req, res) => {
  try {
    const adminExists = await User.count({ where: { role: 'admin' } }) > 0;

    const setupInfo = {
      applicationName: 'SCHOPPMANN Time Tracking System',
      version: '2.0.0',
      environment: config.nodeEnv,
      setupRequired: !adminExists,
      setupSteps: adminExists ? [] : [
        {
          step: 1,
          title: 'Ersten Administrator erstellen',
          endpoint: '/api/setup/create-first-admin',
          method: 'GET',
          description: 'Erstellt den ersten Admin-Benutzer für das System'
        },
        {
          step: 2,
          title: 'Anmelden',
          endpoint: '/login',
          method: 'WEB',
          description: 'Loggen Sie sich mit den generierten Admin-Credentials ein'
        },
        {
          step: 3,
          title: 'Passwort ändern',
          endpoint: '/admin (nach Login)',
          method: 'WEB',
          description: 'Ändern Sie sofort das Standard-Passwort'
        }
      ],
      currentStatus: {
        systemInitialized: adminExists,
        readyForUse: adminExists
      },
      helpLinks: {
        documentation: '/api/',
        healthCheck: '/api/setup/health',
        systemStatus: '/api/setup/status'
      }
    };

    res.json({
      success: true,
      message: 'Setup-Informationen erfolgreich geladen',
      data: setupInfo
    });
  } catch (error) {
    console.error('Fehler beim Laden der Setup-Informationen:', error);
    res.status(500).json({
      success: false,
      error: 'Setup-Informationen konnten nicht geladen werden',
      code: 'SETUP_INFO_ERROR'
    });
  }
});

// ✅ ENTWICKLUNGS-RESET (nur in Development)
if (config.nodeEnv === 'development') {
  router.post('/dev-reset', async (req, res) => {
    try {
      console.log('🔄 Development: Database Reset gestartet...');

      // Alle Benutzer löschen
      await User.destroy({ where: {} });
      console.log('✅ Alle Benutzer gelöscht');

      // Standard-Admin erstellen
      const admin = await User.create({
        email: 'admin@schoppmann.de',
        password: 'Admin123!',
        name: 'Development Administrator',
        role: 'admin',
        isActive: true
      });
      console.log('✅ Development-Admin erstellt');

      // Test-Mitarbeiter erstellen
      const employee = await User.create({
        email: 'test@schoppmann.de',
        password: 'Test123!',
        name: 'Test Mitarbeiter',
        role: 'mitarbeiter',
        isActive: true
      });
      console.log('✅ Test-Mitarbeiter erstellt');

      res.json({
        success: true,
        message: 'Development Database Reset erfolgreich',
        data: {
          createdUsers: [
            {
              email: admin.email,
              name: admin.name,
              role: admin.role,
              password: 'Admin123!'
            },
            {
              email: employee.email,
              name: employee.name,
              role: employee.role,
              password: 'Test123!'
            }
          ],
          note: 'Diese Route ist nur in Development verfügbar'
        }
      });
    } catch (error) {
      console.error('❌ Development Reset fehlgeschlagen:', error);
      res.status(500).json({
        success: false,
        error: 'Development Reset fehlgeschlagen',
        code: 'DEV_RESET_ERROR',
        details: error.message
      });
    }
  });
}

module.exports = router;