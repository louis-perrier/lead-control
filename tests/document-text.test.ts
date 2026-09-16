import { describe, expect, it } from 'vitest'
import { docxXmlToText, documentKind, looksScanned, tidyText } from '../supabase/functions/_shared/document-text'

describe('documentKind', () => {
  it('reconnaît les formats acceptés, extension en majuscules comprise', () => {
    expect(documentKind('offre.TXT')).toBe('text')
    expect(documentKind('notes.md')).toBe('text')
    expect(documentKind('Présentation.pdf')).toBe('pdf')
    expect(documentKind('guide.docx')).toBe('docx')
  })

  it('refuse le reste', () => {
    expect(documentKind('ancien.doc')).toBeNull()
    expect(documentKind('slides.pages')).toBeNull()
    expect(documentKind('sans-extension')).toBeNull()
  })
})

describe('docxXmlToText', () => {
  it('garde les paragraphes, tabulations, retours à la ligne et caractères spéciaux', () => {
    const xml =
      '<w:body><w:p><w:r><w:t>Présentation de l’offre</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t xml:space="preserve">Prix : 1 500 € </w:t></w:r><w:r><w:tab/><w:t>3 fois &amp; suivi</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Ligne 1</w:t><w:br/><w:t>Ligne 2 &lt;important&gt; &#233;t&#xE9;</w:t></w:r></w:p></w:body>'
    expect(tidyText(docxXmlToText(xml))).toBe(
      'Présentation de l’offre\nPrix : 1 500 € \t3 fois & suivi\nLigne 1\nLigne 2 <important> été',
    )
  })
})

describe('nettoyage', () => {
  it('resserre les lignes vides et les espaces de fin', () => {
    expect(tidyText('a  \r\n\r\n\r\n\r\nb\t\n')).toBe('a\n\nb')
  })

  it('reconnaît un PDF scanné', () => {
    expect(looksScanned('  \n 3 \n')).toBe(true)
    expect(looksScanned('Page 1 : le prospect veut vivre de son contenu')).toBe(false)
  })
})
