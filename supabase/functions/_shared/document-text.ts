// Formats des documents de contexte et nettoyage du texte extrait. Aucun import : le module
// sert aussi à l'écran d'import et aux tests.

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
export const ACCEPTED_DOCUMENT_EXTENSIONS = ['txt', 'md', 'pdf', 'docx']

export type DocumentKind = 'text' | 'pdf' | 'docx'

export function documentKind(name: string): DocumentKind | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'txt' || ext === 'md') return 'text'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  return null
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeXml(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, code: string) => {
    if (code[0] !== '#') return ENTITIES[code] ?? whole
    const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
    return Number.isFinite(n) ? String.fromCodePoint(n) : whole
  })
}

// word/document.xml : un paragraphe par <w:p>, tabulations et retours à la ligne explicites.
export function docxXmlToText(xml: string) {
  return decodeXml(
    xml
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<w:(?:br|cr)\b[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  )
}

export function tidyText(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Un PDF scanné ne contient que des images : l'extraction rend au mieux quelques caractères.
export function looksScanned(text: string) {
  return text.replace(/\s/g, '').length < 20
}
