import PDFParser from 'pdf2json'

export async function extractPdfText(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = (pdfData as any).Pages
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .flatMap((page: any) => page.Texts)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((t: any) => {
          try {
            return decodeURIComponent(t.R.map((r: any) => r.T).join(''))
          } catch {
            return t.R.map((r: any) => r.T).join('')
          }
        })
        .join(' ')
      resolve(text)
    })
    pdfParser.on('pdfParser_dataError', reject)
    pdfParser.parseBuffer(buffer)
  })
}
