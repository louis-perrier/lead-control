// Sans import : partagé par les fonctions et les tests.

// Indicatif déduit du fuseau du compte, pour un numéro écrit à la française (06 12 34 56 78).
const DIAL_BY_TZ: Record<string, string> = {
  'Europe/Paris': '33', 'Europe/Monaco': '377', 'Europe/Brussels': '32', 'Europe/Luxembourg': '352',
  'Europe/Zurich': '41', 'Indian/Reunion': '262', 'Indian/Mayotte': '262', 'America/Martinique': '596',
  'America/Guadeloupe': '590', 'America/Cayenne': '594', 'America/Montreal': '1', 'America/Toronto': '1',
  'Africa/Casablanca': '212', 'Africa/Algiers': '213', 'Africa/Tunis': '216', 'Africa/Dakar': '221',
  'Africa/Abidjan': '225', 'Africa/Douala': '237',
}

// Format international sans espace (+33612345678), ou null si le numéro ne s'y ramène pas sûrement.
export function toE164(raw: string | null | undefined, timezone: string): string | null {
  // « +33 (0)6… » : le 0 entre parenthèses ne se compose pas depuis l'étranger.
  const text = (raw ?? '').replace(/\(\s*0\s*\)/g, '').trim()
  if (!text) return null
  const digits = text.replace(/\D/g, '')
  let out: string | null = null
  if (text.startsWith('+')) out = `+${digits}`
  else if (digits.startsWith('00')) out = `+${digits.slice(2)}`
  else if (digits.startsWith('0') && DIAL_BY_TZ[timezone]) out = `+${DIAL_BY_TZ[timezone]}${digits.slice(1)}`
  return out && /^\+[1-9]\d{7,14}$/.test(out) ? out : null
}
