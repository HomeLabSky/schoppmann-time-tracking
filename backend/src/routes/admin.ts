/**
 * Benutzerverwaltung (/admin) – nur für Admins.
 *
 * Konten anlegen, ändern, sperren, löschen; Lohn und Abrechnungszeitraum festlegen. Delegiert an UserService.
 * Den ersten Admin und Notfall-Passwort-Resets gibt es bewusst nur als CLI (npm run admin:create /
 * user:reset-password), nicht über HTTP.
 */
import { createApiRouter } from '../lib/route';
import { AppError } from '../lib/errors';
import UserService from '../services/userService';
import { actorOf } from '../middleware/auth';
import { z, idParam, User } from '../schemas/common';
import { UserData } from '../schemas/auth';
import { UserListQuery, CreateUserBody, UpdateUserBody, UserSettingsBody, UserListData, UserStats } from '../schemas/user';

const api = createApiRouter('/admin', { tags: ['Benutzerverwaltung'] });

const UserIdParam = idParam('id', 'Benutzer-ID');

api.get('/users', {
  summary: 'Benutzer auflisten (Suche, Rollenfilter, Seiten)',
  auth: 'admin',
  query: UserListQuery,
  response: UserListData,
  message: 'User-Liste erfolgreich geladen'
}, async (req) => {
  const { page = 1, limit = 50, search = '', role = '' } = req.valid.query;
  return { data: await UserService.getAllUsers({ page, limit, search, role }) };
});

api.get('/users/:id', {
  summary: 'Einzelnen Benutzer laden (auch deaktivierte)',
  auth: 'admin',
  params: UserIdParam,
  response: UserData,
  message: 'Benutzer erfolgreich geladen',
  errors: ['USER_NOT_FOUND']
}, async (req) => {
  const user = await UserService.findUserById(req.valid.params.id, true);
  if (!user) throw new AppError('USER_NOT_FOUND', 'Benutzer nicht gefunden');
  return { data: { user } };
});

api.post('/users', {
  summary: 'Benutzer anlegen',
  auth: 'admin',
  body: CreateUserBody,
  response: UserData,
  status: 201,
  message: 'Benutzer erfolgreich erstellt',
  errors: ['EMAIL_EXISTS']
}, async (req) => {
  const { email, password, name, role = 'mitarbeiter' } = req.valid.body;
  const user = await UserService.createUser({ email, password, name, role }, actorOf(req));
  return { data: { user } };
});

api.put('/users/:id', {
  summary: 'Benutzer ändern (Name, E-Mail, Rolle, Status, Passwort-Reset)',
  description: 'Ein neues Passwort oder eine Sperrung beendet alle Sitzungen des Benutzers und hebt eine Konto-Sperre auf.',
  auth: 'admin',
  params: UserIdParam,
  body: UpdateUserBody,
  response: UserData,
  message: 'Benutzer erfolgreich aktualisiert',
  errors: ['USER_NOT_FOUND', 'EMAIL_EXISTS']
}, async (req) => {
  const user = await UserService.adminUpdateUser(req.valid.params.id, req.valid.body, actorOf(req));
  return { data: { user } };
});

api.put('/users/:id/settings', {
  summary: 'Lohn, Abrechnungszeitraum und Lohnzettel-E-Mail festlegen',
  description: 'Ein geänderter Stundenlohn gilt nur für neue Zeiteinträge (jeder Eintrag friert seinen Satz ein).',
  auth: 'admin',
  params: UserIdParam,
  body: UserSettingsBody,
  response: UserData,
  message: 'Einstellungen erfolgreich aktualisiert',
  errors: ['USER_NOT_FOUND']
}, async (req) => {
  const user = await UserService.adminUpdateUserSettings(req.valid.params.id, req.valid.body, actorOf(req));
  return { data: { user } };
});

api.patch('/users/:id/toggle-status', {
  summary: 'Benutzer sperren bzw. entsperren',
  auth: 'admin',
  params: UserIdParam,
  response: UserData,
  errors: ['USER_NOT_FOUND', 'CANNOT_DEACTIVATE_SELF']
}, async (req) => {
  const user = await UserService.toggleUserStatus(req.valid.params.id, actorOf(req));
  return {
    message: `Benutzer erfolgreich ${user.isActive ? 'aktiviert' : 'deaktiviert'}`,
    data: { user }
  };
});

api.delete('/users/:id', {
  summary: 'Benutzer löschen (nur ohne Zeiteinträge/Abschlüsse; sonst deaktivieren)',
  auth: 'admin',
  params: UserIdParam,
  response: z.object({ deletedUser: User.pick({ name: true, email: true }) }),
  message: 'Benutzer erfolgreich gelöscht',
  errors: ['USER_NOT_FOUND', 'CANNOT_DELETE_SELF', 'USER_HAS_DEPENDENCIES']
}, async (req) => {
  const deletedUser = await UserService.deleteUser(req.valid.params.id, actorOf(req));
  return { data: { deletedUser } };
});

api.get('/stats/users', {
  summary: 'Benutzer-Kennzahlen',
  auth: 'admin',
  response: UserStats,
  message: 'User-Statistiken erfolgreich geladen'
}, async () => ({ data: await UserService.getUserStats() }));

export default api.router;
