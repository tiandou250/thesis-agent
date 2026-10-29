const MAX_BYTES = 30 * 1024 * 1024

export const ACCEPT_ATTR = '.docx,.pdf,.txt,.md'

export function fileKind(file) {
  const name = String((file && file.name) || '').toLowerCase()
  if (name.endsWith('.docx')) return 'docx'
  if (name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.txt') || name.endsWith('.md')) return 'text'
  if (name.endsWith('.doc')) return 'legacy-doc'
  return 'unknown'
}

function readArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsArrayBuffer(file)
  })
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsText(file, 'utf-8')
  })
}

function htmlToText(root) {
  const out = []
  const push = (s) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim()
    if (t) out.push(t)
  }
  const walk = (node) => {
    for (const child of node.children) {
      const tag = child.tagName.toLowerCase()
      if (/^h[1-6]$/.test(tag)) {
        const level = Math.min(Number(tag.charAt(1)), 3)
        out.push('')
        push('#'.repeat(level) + ' ' + (child.textContent || '').trim())
        out.push('')
      } else if (tag === 'p') {
        push(child.textContent)
      } else if (tag === 'li') {
        push('- ' + (child.textContent || '').trim())
      } else if (tag === 'table') {
        for (const tr of child.querySelectorAll('tr')) {
          const cells = []
          tr.querySelectorAll('td,th').forEach((c) => cells.push((c.textContent || '').trim()))
          if (cells.length) push(cells.join(' | '))
        }
      } else if (tag === 'br') {
        out.push('')
      } else {
        walk(child)
      }
    }
  }
  walk(root)
  return out.join('\n')
}

async function parseDocx(file) {
  if (!window.mammoth) throw new Error('Word 解析组件未加载，请刷新页面重试')
  const arrayBuffer = await readArrayBuffer(file)
  const result = await window.mammoth.convertToHtml({ arrayBuffer })
  const html = result.value || ''
  if (!html.trim()) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return htmlToText(doc.body)
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

async function parsePdf(file, onProgress) {
  if (!window.pdfjsLib) throw new Error('PDF 解析组件未加载，请刷新页面重试')
  const buf = await readArrayBuffer(file)
  const pdf = await withTimeout(
    window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise,
    60000,
    'PDF 解析超时，可能是文件过大或浏览器环境不支持。请改用 Word 文档，或直接粘贴文本。'
  )
  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    let line = ''
    let pageText = ''
    for (const item of content.items) {
      if (typeof item.str !== 'string') continue
      line += item.str
      if (item.hasEOL) {
        pageText += line + '\n'
        line = ''
      }
    }
    if (line) pageText += line + '\n'
    pages.push(pageText.trim())
    if (onProgress && i % 5 === 0) onProgress('正在解析 PDF 第 ' + i + ' / ' + pdf.numPages + ' 页…')
  }
  return pages.join('\n\n')
}

export async function parseFile(file, onProgress) {
  if (!file) throw new Error('没有选择文件')
  if (file.size > MAX_BYTES) throw new Error('文件超过 30MB，请换一个小一些的文件')

  const kind = fileKind(file)
  if (kind === 'legacy-doc') {
    throw new Error('暂不支持旧版 .doc 格式，请用 Word 另存为 .docx 后再上传')
  }
  if (kind === 'unknown') {
    throw new Error('不支持的文件格式，请上传 .docx、.pdf、.txt 或 .md 文件')
  }

  if (onProgress) onProgress('正在解析文件…')

  let text = ''
  if (kind === 'docx') text = await parseDocx(file)
  else if (kind === 'pdf') text = await parsePdf(file, onProgress)
  else text = await readAsText(file)

  text = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (kind === 'pdf' && text.replace(/\s/g, '').length < 300) {
    throw new Error('这个 PDF 里没有检测到文字层，应该是扫描版。请改用 Word 文档，或先用工具把扫描件转成可复制的文字。')
  }
  if (!text.trim()) {
    throw new Error('文件里没有提取到任何文字内容')
  }

  const warnings = []
  if (kind === 'docx') warnings.push('已从 Word 文档提取正文与标题结构，将按章节分块分析。')
  if (kind === 'pdf') warnings.push('PDF 提取出来是无层级的纯文本，将使用整篇快速分析；上传 Word 文档可以获得更细的分章节意见。')

  return { text, kind, warnings, name: file.name, size: file.size }
}
