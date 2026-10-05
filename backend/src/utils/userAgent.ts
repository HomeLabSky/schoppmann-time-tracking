/**
 * Lesbare Gerätebezeichnung aus dem User-Agent für die Sitzungsübersicht ("Edge unter Windows").
 * Bewusst grob – nur zur Wiedererkennung durch den Benutzer, nie für Sicherheitsentscheidungen.
 */

// Reihenfolge wichtig: Edge und Opera geben sich zusätzlich als Chrome aus, Chrome zusätzlich als Safari
const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari']
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux']
];

const first = (list: [RegExp, string][], text: string): string | null => list.find(([pattern]) => pattern.test(text))?.[1] ?? null;

export const describeUserAgent = (userAgent: string | null | undefined): string | null => {
  if (!userAgent) return null;
  const browser = first(BROWSERS, userAgent);
  const system = first(SYSTEMS, userAgent);
  if (browser && system) return `${browser} unter ${system}`;
  return browser ?? system;
};
