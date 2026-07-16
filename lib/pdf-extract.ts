import PDFParser from 'pdf2json'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile, mkdtemp, readdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const execFileAsync = promisify(execFile)

// Render PDF pages to PNG buffers via pdftoppm (poppler-utils).
// maxPages caps how many pages are rendered to avoid huge payloads.
export async function renderPdfToImages(buffer: Buffer, maxPages = 6): Promise<Buffer[]> {
  const workDir = await mkdtemp(join(tmpdir(), 'pdf-render-'))
  const inputPath = join(workDir, 'input.pdf')
  const outputPrefix = join(workDir, 'page')
  try {
    await writeFile(inputPath, buffer)
    await execFileAsync('pdftoppm', [
      '-png', '-r', '150', '-f', '1', '-l', String(maxPages),
      inputPath, outputPrefix,
    ])
    const files = (await readdir(workDir))
      .filter((f) => f.startsWith('page') && f.endsWith('.png'))
      .sort()
    return await Promise.all(files.slice(0, maxPages).map((f) => readFile(join(workDir, f))))
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

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
