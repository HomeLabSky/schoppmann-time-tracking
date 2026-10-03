import { z, required, email, newPassword, personName, User, timestamp } from './common';

const LoginBody = z.object({
  email: email(),
  password: z.string(required('Passwort')).min(1, 'Passwort ist erforderlich').max(256, 'Passwort ist zu lang')
});

const AppLoginBody = LoginBody.extend({
  deviceName: z.string().trim().max(100).optional()
    .describe('Gerätename für die Sitzungsübersicht, z. B. "iPhone von Anna"')
});

const RegisterBody = z.object({
  email: email(),
  password: newPassword(),
  name: personName()
});

const RefreshTokenBody = z.object({
  refreshToken: z.string(required('Erneuerungs-Token')).min(10, 'Ungültiges Erneuerungs-Token').max(512)
});

const ProfileUpdateBody = z.object({
  name: personName().optional(),
  email: email().optional()
});

const ChangePasswordBody = z.object({
  currentPassword: z.string(required('Aktuelles Passwort')).min(1, 'Aktuelles Passwort ist erforderlich').max(256),
  newPassword: newPassword('Neues Passwort'),
  // nur von der Web-Oberfläche gesendet; wenn vorhanden, muss sie übereinstimmen
  confirmPassword: z.string().optional()
}).refine((body) => body.confirmPassword === undefined || body.confirmPassword === body.newPassword, {
  message: 'Passwort-Bestätigung stimmt nicht überein',
  path: ['confirmPassword']
});

const UserData = z.object({ user: User });

const TokenPair = z.object({
  user: User,
  tokenType: z.literal('Bearer'),
  accessToken: z.string().describe('Zugriffs-Token (JWT) für den Header Authorization: Bearer'),
  expiresIn: z.number().int().describe('Gültigkeit des Zugriffs-Tokens in Sekunden'),
  refreshToken: z.string().describe('Erneuerungs-Token; sicher im Gerät speichern (Keychain/Keystore). Wird bei jeder Erneuerung ersetzt.'),
  refreshExpiresAt: timestamp().describe('Ablauf des Erneuerungs-Tokens, wenn es bis dahin nicht genutzt wird')
}).meta({ id: 'TokenPair', description: 'Token-Anmeldung für die App' });

export {
  LoginBody,
  AppLoginBody,
  RegisterBody,
  RefreshTokenBody,
  ProfileUpdateBody,
  ChangePasswordBody,
  UserData,
  TokenPair
};
