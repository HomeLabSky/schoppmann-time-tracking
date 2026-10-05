import { expect, test, type Page } from '@playwright/test'

/**
 * Durchstich durch die wichtigsten Abläufe gegen das echte Backend (Testdaten: backend/test/e2e-server.ts).
 * Die Tests bauen aufeinander auf (Anlegen → Erfassen → Abschließen) und laufen deshalb nacheinander.
 */
test.describe.configure({ mode: 'serial' })

const PASSWORD = process.env.E2E_PASSWORD || 'E2eTest1234'
const ADMIN = 'e2e.admin@schoppmann.test'
const EMPLOYEE = 'e2e.mitarbeiter@schoppmann.test'

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('E-Mail-Adresse').fill(email)
  await page.getByLabel('Passwort').fill(PASSWORD)
  await page.getByRole('button', { name: 'Anmelden' }).click()
  // Erst weiter, wenn die Anmeldung durch ist (Cookies gesetzt, Weiterleitung in den Bereich)
  await expect(page).not.toHaveURL(/\/login$/)
}

async function logout(page: Page) {
  await page.getByRole('button', { name: /Benutzermenü/ }).click()
  await page.getByRole('menuitem', { name: 'Abmelden' }).click()
  await expect(page).toHaveURL(/\/login$/)
}

test('Anmeldung: falsches Passwort zeigt Fehler, Seitenschutz leitet zur Anmeldung', async ({ page }) => {
  await page.goto('/admin/users')
  await expect(page).toHaveURL(/\/login$/)

  await page.getByLabel('E-Mail-Adresse').fill(ADMIN)
  await page.getByLabel('Passwort').fill('falsch')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test('Admin: Übersicht, Benutzer anlegen mit Feldprüfung, Dialog per Esc schließbar', async ({ page }) => {
  await login(page, ADMIN)
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Guten Tag')

  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Benutzer' }).click()
  await expect(page.getByRole('heading', { name: 'Benutzer', level: 1 })).toBeVisible()

  // Dialog: Esc schließt
  await page.getByRole('button', { name: 'Benutzer anlegen' }).click()
  const dialog = page.getByRole('dialog', { name: 'Neuen Benutzer anlegen' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  // Feldprüfung im Browser, dann erfolgreiches Anlegen
  await page.getByRole('button', { name: 'Benutzer anlegen' }).click()
  await expect(dialog.getByLabel('Vollständiger Name')).toBeFocused()
  await dialog.getByRole('button', { name: 'Anlegen' }).click()
  await expect(dialog.getByText('Mindestens 2 Zeichen')).toBeVisible()

  await dialog.getByLabel('Vollständiger Name').fill('Nora Neu')
  await dialog.getByLabel('E-Mail-Adresse').fill('nora.neu@schoppmann.test')
  await dialog.getByLabel('Startpasswort').fill('NeuesKonto1')
  await dialog.getByRole('button', { name: 'Anlegen' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('nora.neu@schoppmann.test')).toBeVisible()

  // Suche filtert die Tabelle
  await page.getByPlaceholder('Name oder E-Mail suchen…').fill('emil')
  await expect(page.getByText(EMPLOYEE)).toBeVisible()
  await expect(page.getByText('nora.neu@schoppmann.test')).toBeHidden()

  await logout(page)
})

test('Mitarbeiter: Arbeitszeit mit Pause erfassen, Kennzahlen aktualisieren sich', async ({ page }) => {
  await login(page, EMPLOYEE)
  await expect(page).toHaveURL(/\/employee\/dashboard$/)

  await page.getByRole('button', { name: 'Arbeitszeit erfassen' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Arbeitszeit erfassen' })
  await dialog.getByLabel('Beginn').fill('08:00')
  await dialog.getByLabel('Ende').fill('12:30')
  await dialog.getByLabel('Pause (Min.)').fill('30')
  await expect(dialog.getByText('4,00 Std.')).toBeVisible()
  await dialog.getByLabel('Tätigkeit').fill('E2E Erfassung')
  await dialog.getByRole('button', { name: 'Erfassen' }).click()
  await expect(dialog).toBeHidden()

  await expect(page.getByRole('cell', { name: 'E2E Erfassung' })).toBeVisible()
  // 4 Std. × 13,50 € = 54,00 €
  await expect(page.getByRole('cell', { name: '54,00 €' })).toBeVisible()

  await page.getByRole('link', { name: 'Einstellungen' }).click()
  await expect(page.getByRole('heading', { name: 'Einstellungen', level: 1 })).toBeVisible()
  await expect(page.getByText('13,50 €')).toBeVisible()

  await logout(page)
})

test('Admin: Vormonat in den Zeitnachweisen abschließen und wieder öffnen', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/admin/timesheets')

  await page.getByRole('button', { name: 'Emil Mitarbeiter' }).click()
  await expect(page).toHaveURL(/user=\d+/)
  await expect(page.getByText('Bereit zum Abschluss')).toBeVisible()

  await page.getByRole('button', { name: 'Periode abschließen…' }).click()
  const closeDialog = page.getByRole('dialog', { name: 'Periode abschließen?' })
  await closeDialog.getByRole('button', { name: 'Abschließen' }).click()
  await expect(closeDialog).toBeHidden()
  await expect(page.getByText(/^Abgeschlossen am/)).toBeVisible()

  await page.getByRole('button', { name: 'Wieder öffnen…' }).click()
  const reopenDialog = page.getByRole('dialog', { name: 'Periode wieder öffnen' })
  await reopenDialog.getByRole('button', { name: 'Wieder öffnen' }).click()
  await expect(reopenDialog.getByText('Bitte mindestens 5 Zeichen')).toBeVisible()
  await reopenDialog.getByLabel('Begründung').fill('E2E: Korrektur nötig')
  await reopenDialog.getByRole('button', { name: 'Wieder öffnen' }).click()
  await expect(reopenDialog).toBeHidden()
  await expect(page.getByText('Bereit zum Abschluss')).toBeVisible()

  // Protokoll enthält beide Vorgänge
  await page.goto('/admin/audit')
  await expect(page.getByText('Periode wieder geöffnet').first()).toBeVisible()
  await expect(page.getByText('Periode abgeschlossen').first()).toBeVisible()
})
