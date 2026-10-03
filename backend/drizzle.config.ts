/**
 * drizzle-kit: erzeugt Migrationen aus src/db/schema.ts (`npm run db:generate`) nach drizzle/.
 * Angewendet werden sie beim Start durch src/db/migrate.ts.
 */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle'
});
