/** Datei im Browser speichern (über einen temporären Download-Link). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Manche Browser lesen die Adresse erst nach dem Klick – kurz verzögert freigeben
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
