import { getDocumentProxy } from 'npm:unpdf@1.8.1'
import { strFromU8, unzipSync } from 'npm:fflate@0.8.3'
import { docxXmlToText, looksScanned, tidyText } from './document-text.ts'
import type { DocumentKind } from './document-text.ts'

// sourceLength : longueur estimée du document entier quand la lecture s'est arrêtée avant la fin.
// detail : cause technique, journalisée pour distinguer un vrai PDF illisible d'une panne d'extraction.
export type Extraction = { text: string; sourceLength: number } | { error: string; detail?: string }

// Les pages sont lues une à une et la lecture s'arrête dès que la place utile est remplie :
// un PDF de 40 pages lu en entier prenait la totalité du temps de calcul d'une fonction.
async function readPdf(bytes: Uint8Array, limit: number) {
  const pdf = await getDocumentProxy(bytes)
  let text = ''
  let pages = 0
  while (pages < pdf.numPages && text.length < limit) {
    pages += 1
    const content = await (await pdf.getPage(pages)).getTextContent()
    for (const item of content.items) {
      if ('str' in item) text += item.str + (item.hasEOL ? '\n' : '')
    }
    text += '\n\n'
  }
  const sourceLength = pages < pdf.numPages ? Math.round((text.length * pdf.numPages) / pages) : text.length
  return { text, sourceLength }
}

export async function extractDocumentText(kind: DocumentKind, file: Blob, limit: number): Promise<Extraction> {
  if (kind === 'text') {
    const text = tidyText(await file.text())
    return text ? { text, sourceLength: text.length } : { error: 'Le document ne contient aucun texte lisible.' }
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (kind === 'pdf') {
    let read: { text: string; sourceLength: number }
    try {
      read = await readPdf(bytes, limit)
    } catch (e) {
      return { error: 'PDF protégé ou illisible : exportez-le à nouveau depuis le document d’origine.', detail: String(e).slice(0, 200) }
    }
    const text = tidyText(read.text)
    return looksScanned(text)
      ? { error: 'PDF scanné : il ne contient que des images, aucun texte à lire.' }
      : { text, sourceLength: Math.max(read.sourceLength, text.length) }
  }
  try {
    const files = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' })
    const xml = files['word/document.xml']
    if (!xml) throw new Error('document.xml absent')
    const text = tidyText(docxXmlToText(strFromU8(xml)))
    return text ? { text, sourceLength: text.length } : { error: 'Le document Word ne contient aucun texte lisible.' }
  } catch (e) {
    return { error: 'Fichier Word illisible : enregistrez-le à nouveau au format .docx.', detail: String(e).slice(0, 200) }
  }
}
