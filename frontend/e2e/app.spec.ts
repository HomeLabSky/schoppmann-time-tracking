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

  // Zweiter Eintrag am selben Tag: Überschneidung wird abgelehnt, anschließender Eintrag angenommen
  await page.getByRole('button', { name: 'Arbeitszeit erfassen' }).first().click()
  await expect(dialog.getByTestId('same-day-entries')).toContainText('08:00–12:30')
  await dialog.getByLabel('Beginn').fill('12:00')
  await dialog.getByLabel('Ende').fill('14:00')
  await dialog.getByLabel('Pause (Min.)').fill('0')
  await dialog.getByRole('button', { name: 'Erfassen' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Überschneidet sich')
  await dialog.getByLabel('Beginn').fill('12:30')
  await dialog.getByLabel('Tätigkeit').fill('E2E Nachmittag')
  await dialog.getByRole('button', { name: 'Erfassen' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('cell', { name: 'E2E Nachmittag' })).toBeVisible()
  // 4 Std. + 1,5 Std. = 5,5 Std. → 74,25 €; zwei Einträge an einem Tag
  await expect(page.getByText('2 Einträge an 1 Tag')).toBeVisible()
  await expect(page.getByText('74,25 €').first()).toBeVisible()

  await page.getByRole('link', { name: 'Einstellungen' }).click()
  await expect(page.getByRole('heading', { name: 'Einstellungen', level: 1 })).toBeVisible()
  await expect(page.getByText('13,50 €')).toBeVisible()

  await logout(page)
})

test('Mitarbeiter: angemeldete Geräte sehen und auf allen anderen Geräten abmelden', async ({ page, browser }, testInfo) => {
  // Zweiter Browser (eigene Cookies) = anderes Gerät
  const otherContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL, locale: 'de-DE' })
  const otherPage = await otherContext.newPage()
  await login(otherPage, EMPLOYEE)
  await expect(otherPage).toHaveURL(/\/employee\/dashboard$/)

  await login(page, EMPLOYEE)
  await page.getByRole('link', { name: 'Einstellungen' }).click()
  const devices = page.getByRole('list', { name: 'Angemeldete Geräte' })
  await expect(devices.getByRole('listitem')).toHaveCount(2)
  await expect(devices.getByText('Dieses Gerät')).toHaveCount(1)

  await page.getByRole('button', { name: 'Auf allen anderen Geräten abmelden' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Andere abmelden' }).click()
  await expect(page.getByText('1 anderes Gerät abgemeldet.')).toBeVisible()
  await expect(devices.getByRole('listitem')).toHaveCount(1)

  // Das andere Gerät ist sofort abgemeldet und landet bei der nächsten Anfrage auf der Anmeldeseite
  await otherPage.reload()
  await expect(otherPage).toHaveURL(/\/login/)
  await otherContext.close()

  await logout(page)
})

test('Admin: Vormonat in den Zeitnachweisen abschließen und wieder öffnen', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/admin/timesheets')

  // Nora Neu (ohne Stunden) ist ausgeblendet – es gibt nichts abzuschließen; auf Wunsch einblendbar
  await expect(page.getByTestId('hidden-empty')).toContainText('1 Mitarbeiter ohne Stunden')
  await expect(page.getByRole('button', { name: 'Nora Neu' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Einblenden' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Nora Neu' }).getByText('Keine Stunden')).toBeVisible()
  await page.getByRole('button', { name: 'Ausblenden' }).click()

  await page.getByRole('button', { name: 'Emil Mitarbeiter' }).click()
  await expect(page).toHaveURL(/user=\d+/)
  await expect(page.getByText('Bereit zum Abschluss')).toBeVisible()

  await page.getByRole('button', { name: 'Periode abschließen…' }).click()
  const closeDialog = page.getByRole('dialog', { name: 'Periode abschließen?' })
  await closeDialog.getByRole('button', { name: 'Abschließen' }).click()
  await expect(closeDialog).toBeHidden()
  await expect(page.getByText(/^Abgeschlossen am/)).toBeVisible()

  // Lohnzettel: einzeln und als Sammel-PDF zum Monatsabschluss
  const single = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Lohnzettel (PDF)' }).click()
  expect((await single).suggestedFilename()).toMatch(/^Lohnzettel_\d{4}-\d{2}_Emil-Mitarbeiter\.pdf$/)
  await page.getByRole('button', { name: 'Übersicht' }).click()
  const all = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Alle Lohnzettel (PDF)' }).click()
  expect((await all).suggestedFilename()).toMatch(/^Lohnzettel_\d{4}-\d{2}_alle\.pdf$/)
  await page.getByRole('button', { name: 'Emil Mitarbeiter' }).click()

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

test('Sonderposten: Admin erfasst eine Auslage, sie zählt mit dem Verdienst zur Auszahlung und lässt sich bearbeiten', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/admin/timesheets')
  await page.getByRole('button', { name: 'Emil Mitarbeiter' }).click()
  await expect(page.getByText('Keine Sonderposten in dieser Periode.')).toBeVisible()

  await page.getByRole('button', { name: 'Sonderposten erfassen' }).click()
  const dialog = page.getByRole('dialog', { name: 'Sonderposten erfassen' })
  await dialog.getByRole('button', { name: 'Erfassen' }).click()
  await expect(dialog.getByText('Bezeichnung ist erforderlich')).toBeVisible()
  await dialog.getByLabel('Bezeichnung').fill('E2E Leuchtmittel')
  await dialog.getByLabel('Betrag (€)').fill('23.90')
  await dialog.getByRole('button', { name: 'Erfassen' }).click()
  await expect(dialog).toBeHidden()

  const row = page.getByRole('row').filter({ hasText: 'E2E Leuchtmittel' })
  await expect(row).toContainText('23,90')
  // 54,00 € Verdienst + 23,90 € Sonderposten, unter der Grenze von 603 € → beides wird ausgezahlt
  await expect(page.getByText(/^\+ 23,90\s€ Sonderposten$/)).toBeVisible()
  await expect(page.getByText(/^77,90\s€$/)).toBeVisible()

  await row.getByRole('button', { name: 'Aktionen für E2E Leuchtmittel' }).click()
  await page.getByRole('menuitem', { name: 'Bearbeiten' }).click()
  const edit = page.getByRole('dialog', { name: 'Sonderposten bearbeiten' })
  await edit.getByLabel('Betrag (€)').fill('24.50')
  await edit.getByRole('button', { name: 'Speichern' }).click()
  await expect(edit).toBeHidden()
  await expect(page.getByText(/^78,50\s€$/)).toBeVisible()

  await page.goto('/admin/audit')
  await expect(page.getByText('Sonderposten geändert').first()).toBeVisible()
  await logout(page)
})

/** Letzter Tag des Vormonats (YYYY-MM-DD, Ortszeit) */
function lastOfPreviousMonth(): string {
  const d = new Date()
  d.setDate(0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('Nachtrag: Arbeitszeit im abgeschlossenen Vormonat wird in der laufenden Periode abgerechnet', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/admin/timesheets')
  await page.getByRole('button', { name: 'Emil Mitarbeiter' }).click()
  await page.getByRole('button', { name: 'Periode abschließen…' }).click()
  const closeDialog = page.getByRole('dialog', { name: 'Periode abschließen?' })
  await closeDialog.getByRole('button', { name: 'Abschließen' }).click()
  await expect(page.getByText(/^Abgeschlossen am/)).toBeVisible()
  await logout(page)

  await login(page, EMPLOYEE)
  await page.getByRole('button', { name: 'Arbeitszeit erfassen' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Arbeitszeit erfassen' })
  await dialog.getByLabel('Datum').fill(lastOfPreviousMonth())
  await expect(dialog.getByTestId('nachtrag-hint')).toBeVisible()
  await dialog.getByLabel('Beginn').fill('15:00')
  await dialog.getByLabel('Ende').fill('17:00')
  await dialog.getByLabel('Pause (Min.)').fill('0')
  await dialog.getByLabel('Tätigkeit').fill('E2E Nachtrag')
  await dialog.getByRole('button', { name: 'Erfassen' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Als Nachtrag erfasst.')).toBeVisible()

  // Erscheint in der laufenden Periode, gekennzeichnet als Nachtrag
  const row = page.getByRole('row').filter({ hasText: 'E2E Nachtrag' })
  await expect(row.getByText('Nachtrag', { exact: true })).toBeVisible()
  await logout(page)
})

test('Vorzeitiger Abschluss: laufender Monat wird abgeschlossen, weitere Arbeitszeit ist Nachtrag im Folgemonat', async ({ page }) => {
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  await login(page, ADMIN)
  await page.goto(`/admin/timesheets?month=${currentMonth}`)
  await page.getByRole('button', { name: 'Emil Mitarbeiter' }).click()
  await expect(page.getByText('Periode läuft noch')).toBeVisible()
  await page.getByRole('button', { name: 'Periode abschließen…' }).click()
  const closeDialog = page.getByRole('dialog', { name: 'Periode abschließen?' })
  await expect(closeDialog.getByText('Vorzeitiger Abschluss')).toBeVisible()
  await closeDialog.getByRole('button', { name: 'Abschließen' }).click()
  await expect(closeDialog).toBeHidden()
  await expect(page.getByText(/^Abgeschlossen am/)).toBeVisible()
  await logout(page)

  // Der Mitarbeiter landet in der nächsten offenen Periode und kann dort weiter erfassen
  await login(page, EMPLOYEE)
  await page.getByRole('button', { name: 'Arbeitszeit erfassen' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Arbeitszeit erfassen' })
  await expect(dialog.getByTestId('nachtrag-hint')).toBeVisible()
  await dialog.getByLabel('Beginn').fill('18:00')
  await dialog.getByLabel('Ende').fill('19:00')
  await dialog.getByLabel('Pause (Min.)').fill('0')
  await dialog.getByLabel('Tätigkeit').fill('E2E Vorzeitig')
  await dialog.getByRole('button', { name: 'Erfassen' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Als Nachtrag erfasst.')).toBeVisible()
  const row = page.getByRole('row').filter({ hasText: 'E2E Vorzeitig' })
  await expect(row.getByText('Nachtrag', { exact: true })).toBeVisible()
  await logout(page)
})

test('Nacherfassung: Admin gibt frei, Mitarbeiter erfasst einen Tag vor drei Monaten im eigenen Monat', async ({ page }) => {
  const d = new Date()
  const start = new Date(d.getFullYear(), d.getMonth() - 3, 1)
  const ym = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`

  await login(page, ADMIN)
  await page.goto('/admin/users')
  await page.getByRole('button', { name: 'Aktionen für Emil Mitarbeiter' }).click()
  await page.getByRole('menuitem', { name: 'Abrechnungsdaten' }).click()
  const settings = page.getByRole('dialog', { name: 'Abrechnungsdaten' })
  await settings.getByLabel('Nacherfassung erlauben ab').fill(`${ym}-01`)
  await settings.getByRole('button', { name: 'Speichern' }).click()
  await expect(settings).toBeHidden()
  await expect(page.getByRole('row').filter({ hasText: 'Emil Mitarbeiter' }).getByText(/^Nacherfassung ab/)).toBeVisible()
  await logout(page)

  await login(page, EMPLOYEE)
  await page.getByRole('button', { name: 'Arbeitszeit erfassen' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Arbeitszeit erfassen' })
  await expect(dialog.getByText(/Nacherfassung freigegeben/)).toBeVisible()
  await dialog.getByLabel('Datum').fill(`${ym}-02`)
  await dialog.getByLabel('Beginn').fill('09:00')
  await dialog.getByLabel('Ende').fill('12:00')
  await dialog.getByLabel('Pause (Min.)').fill('0')
  await dialog.getByLabel('Tätigkeit').fill('E2E Excel-Übernahme')
  await expect(dialog.getByTestId('nachtrag-hint')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Erfassen' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Arbeitszeit erfasst.')).toBeVisible()

  // Steht im eigenen Monat, nicht als Nachtrag
  await page.getByLabel('Abrechnungsperiode').selectOption(ym)
  const row = page.getByRole('row').filter({ hasText: 'E2E Excel-Übernahme' })
  await expect(row).toBeVisible()
  await expect(row.getByText('Nachtrag', { exact: true })).toHaveCount(0)
  await logout(page)
})

test('Nacherfassung: Tag im schon abgeschlossenen Monat wird Nachtrag im direkt folgenden Monat', async ({ page }) => {
  const d = new Date()
  const start = new Date(d.getFullYear(), d.getMonth() - 3, 1)
  const last = new Date(d.getFullYear(), d.getMonth() - 2, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  const ym = `${start.getFullYear()}-${pad(start.getMonth() + 1)}`
  const following = new Date(d.getFullYear(), d.getMonth() - 2, 1)
  const ymFollowing = `${following.getFullYear()}-${pad(following.getMonth() + 1)}`

  // Wie damals: Der Monat ist schon abgerechnet
  await login(page, ADMIN)
  await page.goto(`/admin/timesheets?month=${ym}`)
  await page.getByRole('button', { name: 'Emil Mitarbeiter' }).click()
  await page.getByRole('button', { name: 'Periode abschließen…' }).click()
  const closeDialog = page.getByRole('dialog', { name: 'Periode abschließen?' })
  await closeDialog.getByRole('button', { name: 'Abschließen' }).click()
  await expect(page.getByText(/^Abgeschlossen am/)).toBeVisible()
  await logout(page)

  await login(page, EMPLOYEE)
  await page.getByRole('button', { name: 'Arbeitszeit erfassen' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Arbeitszeit erfassen' })
  await dialog.getByLabel('Datum').fill(`${ym}-${pad(last.getDate())}`)
  await expect(dialog.getByTestId('nachtrag-hint')).toBeVisible()
  await dialog.getByLabel('Beginn').fill('09:00')
  await dialog.getByLabel('Ende').fill('11:00')
  await dialog.getByLabel('Pause (Min.)').fill('0')
  await dialog.getByLabel('Tätigkeit').fill('E2E später Tag')
  await dialog.getByRole('button', { name: 'Erfassen' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Als Nachtrag erfasst.')).toBeVisible()

  await page.getByLabel('Abrechnungsperiode').selectOption(ymFollowing)
  const row = page.getByRole('row').filter({ hasText: 'E2E später Tag' })
  await expect(row.getByText('Nachtrag', { exact: true })).toBeVisible()
  await logout(page)
})
