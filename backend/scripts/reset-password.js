/**
 * Setzt das Passwort eines Benutzers zurück (z. B. wenn das Admin-Passwort vergessen wurde).
 *
 * Aufruf (im Ordner backend):
 *   npm run user:reset-password -- admin@schoppmann.de
 *   npm run user:reset-password -- admin@schoppmann.de --generate
 *
 * Läuft direkt gegen die Datenbank aus backend/.env (DB_STORAGE) – vorher ein
 * Backup der .db-Datei anlegen.
 */
const { ask, closeCli, obtainPassword, boot } = require('./lib/cli');
const SessionService = require('../services/sessionService');
const LoginThrottleService = require('../services/loginThrottle');

(async () => {
  const { User } = await boot();

  const positional = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const email = (positional || (await ask('E-Mail-Adresse des Benutzers'))).toLowerCase();

  const user = await User.findOne({ where: { email } });
  if (!user) {
    const known = (await User.findAll({ attributes: ['email', 'role'] })).map((u) => `${u.email} (${u.role})`);
    console.error(`❌ Kein Benutzer mit der E-Mail ${email}.`);
    console.error(`   Vorhanden: ${known.join(', ') || 'keine'}`);
    process.exitCode = 1;
    return;
  }

  const { password, generated } = await obtainPassword(process.argv.includes('--generate'));
  user.password = password; // wird im Model-Hook gehasht
  await user.save();
  const ended = await SessionService.revokeAllForUser(user.id, { reason: 'password_reset_cli' });
  await LoginThrottleService.reset(user.email); // Sperre nach Fehlversuchen aufheben

  console.log(`✅ Passwort zurückgesetzt für ${user.email} (${user.role})`);
  if (ended > 0) console.log(`🔒 ${ended} bestehende Sitzung(en) beendet – der Benutzer muss sich neu anmelden.`);
  if (!user.isActive) {
    console.log('⚠️  Das Konto ist deaktiviert – Login erst nach Aktivierung durch einen Admin möglich.');
  }
  if (generated) {
    console.log(`   Passwort (nur jetzt sichtbar): ${password}`);
  }
})()
  .catch((error) => {
    console.error('❌ Fehler:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    closeCli();
    try { await require('../models').sequelize.close(); } catch { /* bereits geschlossen */ }
  });
