/**
 * Setzt das Passwort eines Benutzers zurück (z. B. wenn das Admin-Passwort vergessen wurde).
 *
 * Aufruf (im Ordner backend):
 *   npm run user:reset-password -- admin@schoppmann.de
 *   npm run user:reset-password -- admin@schoppmann.de --generate
 *
 * Läuft direkt gegen die Datenbank aus backend/.env (DB_STORAGE). Beendet alle Sitzungen des Benutzers und
 * hebt eine Konto-Sperre nach Fehlversuchen auf.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import { hashPassword } from '../models/user';
import { AuditService } from '../services/auditService';
import { LoginThrottleService } from '../services/loginThrottle';
import { SessionService } from '../services/sessionService';
import { ask, boot, obtainPassword, shutdown } from './lib/cli';

const main = async (): Promise<void> => {
  await boot();

  const positional = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const email = (positional || (await ask('E-Mail-Adresse des Benutzers'))).toLowerCase();

  const user = db().select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    const known = db().select({ email: users.email, role: users.role }).from(users).all().map((u) => `${u.email} (${u.role})`);
    console.error(`❌ Kein Benutzer mit der E-Mail ${email}.`);
    console.error(`   Vorhanden: ${known.join(', ') || 'keine'}`);
    process.exitCode = 1;
    return;
  }

  const { password, generated } = await obtainPassword(process.argv.includes('--generate'));
  const passwordHash = await hashPassword(password);
  const ended = db().transaction(() => {
    db().update(users).set({ password: passwordHash }).where(eq(users.id, user.id)).run();
    AuditService.record({
      actor: null,
      action: 'user.update',
      entityType: 'User',
      entityId: user.id,
      targetUserId: user.id,
      meta: { passwordChanged: true, via: 'cli' }
    });
    return SessionService.revokeAllForUser(user.id, { reason: 'password_reset_cli' });
  });
  await LoginThrottleService.reset(user.email); // Sperre nach Fehlversuchen aufheben

  console.log(`✅ Passwort zurückgesetzt für ${user.email} (${user.role})`);
  if (ended > 0) console.log(`🔒 ${ended} bestehende Sitzung(en) beendet – der Benutzer muss sich neu anmelden.`);
  if (!user.isActive) {
    console.log('⚠️  Das Konto ist deaktiviert – Login erst nach Aktivierung durch einen Admin möglich.');
  }
  if (generated) {
    console.log(`   Passwort (nur jetzt sichtbar): ${password}`);
  }
};

main()
  .catch((error: unknown) => {
    console.error('❌ Fehler:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(shutdown);
