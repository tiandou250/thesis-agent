const HEADING_RE = /^\s*(第\s*[一二三四五六七八九十百零〇\d]+\s*[章节篇部讲]|摘\s*要|Abstract|绪\s*论|引\s*言|结\s*论|结束语|参考文献|致\s*谢|[一二三四五六七八九十]+\s*[、．.]|\d+(?:\.\d+){0,2}\s*[、．.\s])/

export const DEFAULT_MAX_CHARS = 15000
const MIN_CHARS = 4000

export function extractTitle(text) {
  const lines = String(text || '').split(/\r?\n/)
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const t = lines[i].trim()
    if (!t) continue
    if (t.length >= 4 && t.length <= 60) return t.replace(/^[#\s]+/, '')
  }
  return ''
}

export function extractAbstract(text) {
  const src = String(text || '')
  const m = src.match(/(摘\s*要|内容摘要|Abstract)\s*[:：]?\s*([\s\S]{30,1200}?)(\n\s*\n|关\s*键\s*词|关键词|Abstract|第\s*一\s*章|一\s*、)/i)
  if (m && m[2]) return m[2].trim().slice(0, 900)
  return src.slice(0, 500)
}

function hardSplit(text, maxChars) {
  const paras = String(text).split(/\n\s*\n/)
  const out = []
  let cur = ''
  const flush = () => {
    if (cur) {
      out.push(cur)
      cur = ''
    }
  }
  for (const p of paras) {
    if (p.length > maxChars) {
      flush()
      for (let i = 0; i < p.length; i += maxChars) out.push(p.slice(i, i + maxChars))
      continue
    }
    if (cur && cur.length + p.length + 2 > maxChars) flush()
    cur = cur ? cur + '\n\n' + p : p
  }
  flush()
  return out
    .filter((s) => s.trim())
    .map((s, i) => ({ title: '第 ' + (i + 1) + ' 部分', text: s }))
}

function packSections(sections, maxChars) {
  const out = []
  let buf = []
  let bufLen = 0
  const flush = () => {
    if (!buf.length) return
    out.push({
      title: buf.length === 1 ? buf[0].title : buf[0].title + ' 等 ' + buf.length + ' 节',
      text: buf.map((s) => s.text).join('\n\n'),
    })
    buf = []
    bufLen = 0
  }
  for (const s of sections) {
    if (s.text.length > maxChars) {
      flush()
      const pieces = hardSplit(s.text, maxChars)
      pieces.forEach((p, idx) => {
        const suffix = pieces.length > 1 ? '（' + (idx + 1) + '/' + pieces.length + '）' : ''
        out.push({ title: s.title + suffix, text: p.text })
      })
      continue
    }
    if (bufLen && bufLen + s.text.length > maxChars) flush()
    buf.push(s)
    bufLen += s.text.length + 2
  }
  flush()
  return out
}

function mergeSmall(chunks, maxChars) {
  if (chunks.length <= 1) return chunks
  const out = []
  for (const c of chunks) {
    const last = out[out.length - 1]
    if (last && last.text.length < MIN_CHARS && last.text.length + c.text.length <= maxChars) {
      last.text += '\n\n' + c.text
      last.title = last.title + ' / ' + c.title
    } else {
      out.push({ title: c.title, text: c.text })
    }
  }
  return out
}

export function splitIntoChunks(text, options) {
  const maxChars = (options && options.maxChars) || DEFAULT_MAX_CHARS
  const src = String(text || '')
  if (!src.trim()) return []
  if (src.length <= maxChars) return [{ title: '全文', text: src }]

  const lines = src.split(/\r?\n/)
  const marks = []
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (t && t.length <= 40 && HEADING_RE.test(t)) marks.push({ index: i, title: t })
  }

  if (marks.length < 2) {
    const pieces = hardSplit(src, maxChars)
    return pieces.length > 1 ? pieces : [{ title: '全文', text: src }]
  }

  const sections = []
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index
    const end = i + 1 < marks.length ? marks[i + 1].index : lines.length
    const body = lines.slice(start, end).join('\n').trim()
    if (body) sections.push({ title: marks[i].title, text: body })
  }

  const packed = mergeSmall(packSections(sections, maxChars), maxChars)
  return packed.length ? packed : hardSplit(src, maxChars)
}

export function buildChunkCountHint(count, mode) {
  if (mode === 'whole') return '整篇分析'
  return '分章节深度分析（共 ' + count + ' 章）'
}
