/**
 * Benutzerkonten: Passwort-Hashing und die Form, in der Konten die API verlassen (nie mit Passwort).
 */
import bcrypt from 'bcryptjs';
import type { User } from '../db/schema';

const BCRYPT_ROUNDS = 10;

export type SafeUser = Omit<User, 'password'>;

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, BCRYPT_ROUNDS);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> => bcrypt.compare(String(plain), hash);

/** Konto ohne Passwort; nicht gesetzte Felder einheitlich als null */
export const toSafeUser = (user: User): SafeUser => {
  const { password: _password, ...safe } = user;
  return {
    ...safe,
    isActive: safe.isActive ?? true,
    stundenlohn: safe.stundenlohn ?? null,
    lohnzettelEmail: safe.lohnzettelEmail ?? null
  };
};
