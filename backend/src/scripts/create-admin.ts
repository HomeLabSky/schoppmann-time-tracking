/**
 * Legt einen Administrator an (Ersteinrichtung oder weiterer Admin).
 *
 * Aufruf (im Ordner backend):
 *   npm run admin:create
 *   npm run admin:create -- --generate      # zufälliges Passwort, wird einmal angezeigt
 *   npm run admin:create -- --email=chef@firma.de --name="Max Chef"
 *
 * Keine HTTP-Route: Wartung läuft nur lokal auf dem Server, mit Zugriff auf die Datenbank.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import { hashPassword } from '../models/user';
import { AuditService } from '../services/auditService';
import { ask, boot, obtainPassword, shutdown } from './lib/cli';

const arg = (name: string): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
};

const main = async (): Promise<void> => {
  await boot();

  const email = (arg('email') || (await ask('E-Mail-Adresse', { defaultValue: 'admin@schoppmann.de' }))).toLowerCase();
  const name = arg('name') || (await ask('Name', { defaultValue: 'Administrator' }));

  if (db().select({ id: users.id }).from(users).where(eq(users.email, email)).get()) {
    console.error(`❌ ${email} existiert bereits. Passwort ändern: npm run user:reset-password -- ${email}`);
    process.exitCode = 1;
    return;
  }

  const { password, generated } = await obtainPassword(process.argv.includes('--generate'));
  const passwordHash = await hashPassword(password);
  db().transaction(() => {
    const user = db().insert(users).values({ email, name, password: passwordHash, role: 'admin', isActive: true }).returning().get();
    AuditService.record({
      actor: null,
      action: 'user.create',
      entityType: 'User',
      entityId: user.id,
      targetUserId: user.id,
      after: { email: user.email, name: user.name, role: user.role, isActive: user.isActive },
      meta: { via: 'cli' }
    });
  });

  console.log(`✅ Administrator angelegt: ${email}`);
  if (generated) {
    console.log(`   Passwort (nur jetzt sichtbar): ${password}`);
  }
  console.log('   Nach dem ersten Login das Passwort im Portal ändern.');
};

main()
  .catch((error: unknown) => {
    console.error('❌ Fehler:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(shutdown);
