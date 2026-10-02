/**
 * Legt einen Administrator an (Ersteinrichtung oder weiterer Admin).
 *
 * Aufruf (im Ordner backend):
 *   npm run admin:create
 *   npm run admin:create -- --generate      # zufälliges Passwort, wird einmal angezeigt
 *   npm run admin:create -- --email=chef@firma.de --name="Max Chef"
 *
 * Ersetzt die früheren HTTP-Routen /api/setup/create-first-admin und
 * /api/admin/create-first-admin (feste, öffentlich bekannte Passwörter).
 */
const { ask, closeCli, obtainPassword, boot } = require('./lib/cli');

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
};

(async () => {
  const { User, sequelize } = await boot();

  const email = (arg('email') || (await ask('E-Mail-Adresse', { defaultValue: 'admin@schoppmann.de' }))).toLowerCase();
  const name = arg('name') || (await ask('Name', { defaultValue: 'Administrator' }));

  if (await User.findOne({ where: { email } })) {
    console.error(`❌ ${email} existiert bereits. Passwort ändern: npm run user:reset-password -- ${email}`);
    process.exitCode = 1;
    return;
  }

  const { password, generated } = await obtainPassword(process.argv.includes('--generate'));
  await User.create({ email, name, password, role: 'admin', isActive: true });

  console.log(`✅ Administrator angelegt: ${email}`);
  if (generated) {
    console.log(`   Passwort (nur jetzt sichtbar): ${password}`);
  }
  console.log('   Nach dem ersten Login das Passwort im Portal ändern.');
})()
  .catch((error) => {
    console.error('❌ Fehler:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    closeCli();
    try { await require('../models').sequelize.close(); } catch { /* bereits geschlossen */ }
  });
