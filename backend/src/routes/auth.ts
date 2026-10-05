/**
 * Anmeldung (/auth) – zwei Wege auf derselben Sitzungs-Tabelle:
 *
 *   Web:  POST /login, /refresh, /logout   → Tokens ausschließlich in httpOnly-Cookies
 *   App:  POST /token, /token/refresh, /token/revoke → Tokens im Body, Anfragen mit Authorization: Bearer
 *
 * Dünne Controller-Schicht: AuthService (Konto-Sperre, Sitzungen, Protokoll), UserService (Profil, Passwort).
 */
import type { Request, Response } from 'express';
import config from '../config';
import { createApiRouter } from '../lib/route';
import { AppError } from '../lib/errors';
import { AuthService, type AuthContext } from '../services/authService';
import { UserService } from '../services/userService';
import type { SafeUser } from '../models/user';
import type { IssuedSession } from '../services/sessionService';
import { actorOf, readAccessToken } from '../middleware/auth';
import { SessionError } from '../services/sessionService';
import { setAuthCookies, clearAuthCookies, readCookies } from '../utils/authCookies';
import {
  LoginBody, AppLoginBody, RegisterBody, RefreshTokenBody, ProfileUpdateBody, ChangePasswordBody, UserData, TokenPair,
  SessionIdParam, SessionList, RevokedCount
} from '../schemas/auth';

const api = createApiRouter('/auth', { tags: ['Anmeldung'] });

const webContext = (req: Request): AuthContext => ({ ip: req.ip, userAgent: req.get('user-agent'), clientType: 'web' });
const appContext = (req: Request, deviceName?: string): AuthContext =>
  ({ ip: req.ip, userAgent: req.get('user-agent'), clientType: 'app', deviceName });

/** Token-Antwort für die App; nie zwischenspeichern */
const tokenPair = (res: Response, user: SafeUser, session: IssuedSession) => {
  res.set('Cache-Control', 'no-store');
  return {
    user,
    tokenType: 'Bearer',
    accessToken: session.accessToken,
    expiresIn: config.auth.accessTtlSeconds,
    refreshToken: session.refreshToken,
    refreshExpiresAt: session.refreshExpiresAt.toISOString()
  };
};

// ---------------- Web (Cookies) ----------------

api.post('/register', {
  summary: 'Selbstregistrierung (nur wenn ALLOW_REGISTRATION aktiv)',
  auth: 'public',
  body: RegisterBody,
  response: UserData,
  status: 201,
  message: 'Registrierung erfolgreich',
  errors: ['REGISTRATION_DISABLED', 'EMAIL_EXISTS']
}, async (req, res) => {
  if (!config.allowRegistration) {
    throw new AppError('REGISTRATION_DISABLED', 'Selbstregistrierung ist deaktiviert. Bitte wenden Sie sich an einen Administrator.');
  }
  const { user, session } = await AuthService.register(req.valid.body, webContext(req));
  setAuthCookies(res, session, req.baseUrl);
  return { data: { user } };
});

api.post('/login', {
  summary: 'Anmelden (Web): setzt httpOnly-Cookies',
  description: 'Nach 5 Fehlversuchen ist die Anmeldung für die Adresse 15 Minuten gesperrt (ACCOUNT_LOCKED, Header Retry-After); jede weitere Serie verdoppelt die Sperre.',
  auth: 'public',
  body: LoginBody,
  response: UserData,
  message: 'Login erfolgreich',
  errors: ['INVALID_CREDENTIALS', 'USER_INACTIVE', 'ACCOUNT_LOCKED']
}, async (req, res) => {
  const { email, password } = req.valid.body;
  const { user, session } = await AuthService.login(email, password, webContext(req));
  setAuthCookies(res, session, req.baseUrl);
  return { data: { user } };
});

api.post('/refresh', {
  summary: 'Sitzung erneuern (Web): Erneuerungs-Cookie wird ausgetauscht',
  auth: 'public',
  response: UserData,
  message: 'Sitzung erfolgreich erneuert',
  errors: ['MISSING_REFRESH_TOKEN', 'INVALID_REFRESH_TOKEN', 'REFRESH_TOKEN_REUSED', 'REFRESH_IN_PROGRESS']
}, async (req, res) => {
  const refreshToken = readCookies(req)[config.auth.refreshCookie];
  if (!refreshToken) throw new AppError('MISSING_REFRESH_TOKEN', 'Nicht angemeldet');

  try {
    const { user, accessToken, refreshToken: next } = await AuthService.refresh(refreshToken, webContext(req));
    setAuthCookies(res, { accessToken, refreshToken: next }, req.baseUrl);
    return { data: { user } };
  } catch (error) {
    // Zwei Tabs erneuern gleichzeitig: Cookies behalten, der Client versucht es mit dem neuen Cookie erneut
    if (error instanceof SessionError && error.code !== 'REFRESH_IN_PROGRESS') clearAuthCookies(res);
    throw error;
  }
});

api.post('/logout', {
  summary: 'Abmelden (Web und App): beendet die Sitzung serverseitig',
  description: 'Bewusst ohne Anmeldeprüfung – auch mit abgelaufenem Zugriffs-Token muss man sich abmelden können. ' +
    'Die App schickt ihr Zugriffs-Token im Authorization-Header oder nutzt POST /auth/token/revoke.',
  auth: 'public',
  message: 'Erfolgreich abgemeldet'
}, async (req, res) => {
  const cookies = readCookies(req);
  const { token, via } = readAccessToken(req);
  await AuthService.logout(
    { refreshToken: via === 'cookie' ? cookies[config.auth.refreshCookie] : undefined, accessToken: token },
    { ip: req.ip, clientType: via === 'bearer' ? 'app' : 'web' }
  );
  clearAuthCookies(res);
  return {};
});

// ---------------- App (Bearer-Token) ----------------

api.post('/token', {
  summary: 'Anmelden (App): liefert Zugriffs- und Erneuerungs-Token',
  description: 'Das Zugriffs-Token (15 min) gehört in den Header `Authorization: Bearer …`. Das Erneuerungs-Token ' +
    'sicher im Gerät speichern (Keychain/Keystore); es gilt gleitend 30 Tage, eine Sitzung höchstens 90 Tage. ' +
    'Gleiche Konto-Sperre wie bei der Web-Anmeldung.',
  auth: 'public',
  body: AppLoginBody,
  response: TokenPair,
  message: 'Login erfolgreich',
  errors: ['INVALID_CREDENTIALS', 'USER_INACTIVE', 'ACCOUNT_LOCKED']
}, async (req, res) => {
  const { email, password, deviceName } = req.valid.body;
  const { user, session } = await AuthService.login(email, password, appContext(req, deviceName));
  return { data: tokenPair(res, user, session) };
});

api.post('/token/refresh', {
  summary: 'Tokens erneuern (App): tauscht das Erneuerungs-Token aus',
  description: 'Das alte Erneuerungs-Token ist danach ungültig – sofort das neue speichern. Wird ein bereits ' +
    'ausgetauschtes Token erneut vorgelegt, gilt es als gestohlen: die Sitzung endet (REFRESH_TOKEN_REUSED). ' +
    'Bei REFRESH_IN_PROGRESS (409) kurz warten und mit dem zuletzt gespeicherten Token wiederholen.',
  auth: 'public',
  body: RefreshTokenBody,
  response: TokenPair,
  message: 'Sitzung erfolgreich erneuert',
  errors: ['INVALID_REFRESH_TOKEN', 'REFRESH_TOKEN_REUSED', 'REFRESH_IN_PROGRESS', 'USER_INACTIVE']
}, async (req, res) => {
  const rotated = await AuthService.refresh(req.valid.body.refreshToken, appContext(req));
  return { data: tokenPair(res, rotated.user, rotated) };
});

api.post('/token/revoke', {
  summary: 'Abmelden (App): beendet die Sitzung des Erneuerungs-Tokens',
  auth: 'public',
  body: RefreshTokenBody,
  message: 'Erfolgreich abgemeldet'
}, async (req) => {
  await AuthService.logout({ refreshToken: req.valid.body.refreshToken }, { ip: req.ip, clientType: 'app' });
  return {};
});

// ---------------- Eigenes Konto ----------------

api.get('/profile', {
  summary: 'Eigenes Benutzerkonto',
  response: UserData,
  message: 'Profil erfolgreich geladen',
  errors: ['USER_NOT_FOUND']
}, async (req) => {
  const user = await UserService.findUserById(req.user.userId);
  if (!user) throw new AppError('USER_NOT_FOUND', 'Benutzer nicht gefunden');
  return { data: { user } };
});

api.put('/profile', {
  summary: 'Name/E-Mail des eigenen Kontos ändern',
  body: ProfileUpdateBody,
  response: UserData,
  message: 'Profil erfolgreich aktualisiert',
  errors: ['EMAIL_EXISTS']
}, async (req) => {
  const user = await UserService.updateUserProfile(req.user.userId, req.valid.body);
  return { data: { user } };
});

api.put('/change-password', {
  summary: 'Eigenes Passwort ändern',
  description: 'Beendet alle anderen Sitzungen des Benutzers (andere Browser und Geräte); die aktuelle bleibt bestehen.',
  body: ChangePasswordBody,
  message: 'Passwort erfolgreich geändert',
  errors: ['INVALID_CURRENT_PASSWORD']
}, async (req) => {
  const { currentPassword, newPassword } = req.valid.body;
  await UserService.changeUserPassword(req.user.userId, currentPassword, newPassword, undefined, req.user.sid);
  return {};
});

// ---------------- Sitzungen (angemeldete Browser und Geräte) ----------------

api.get('/sessions', {
  summary: 'Eigene laufende Sitzungen (Browser und App-Geräte)',
  description: 'Die Sitzung dieser Anfrage steht vorne (`current: true`). Beendete und abgelaufene erscheinen nicht.',
  response: SessionList,
  message: 'Sitzungen erfolgreich geladen'
}, async (req) => {
  return { data: { sessions: AuthService.listSessions(req.user.userId, req.user.sid) } };
});

api.post('/sessions/revoke-others', {
  summary: 'Überall sonst abmelden: alle anderen eigenen Sitzungen beenden',
  description: 'Die aktuelle Sitzung bleibt bestehen. Andere Geräte werden bei ihrer nächsten Anfrage abgemeldet ' +
    '(Zugriffs-Tokens werden bei jeder Anfrage gegen die Sitzung geprüft).',
  response: RevokedCount,
  message: 'Andere Sitzungen beendet'
}, async (req) => {
  return { data: { revokedCount: AuthService.revokeOtherSessions(req.user.userId, req.user.sid, actorOf(req)) } };
});

api.delete('/sessions/:sid', {
  summary: 'Eine eigene Sitzung beenden (z. B. verlorenes Gerät)',
  description: 'Die aktuelle Sitzung wird über POST /auth/logout beendet (CANNOT_REVOKE_CURRENT_SESSION).',
  params: SessionIdParam,
  message: 'Sitzung beendet',
  errors: ['SESSION_NOT_FOUND', 'CANNOT_REVOKE_CURRENT_SESSION']
}, async (req) => {
  AuthService.revokeSession(req.user.userId, req.valid.params.sid, req.user.sid, actorOf(req));
  return {};
});

export default api.router;
