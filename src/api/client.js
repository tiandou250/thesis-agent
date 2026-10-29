export function llmHeaders(cfg) {
  return {
    'Content-Type': 'application/json',
    'X-LLM-Base': cfg.base || '',
    'X-LLM-Key': cfg.key || '',
    'X-LLM-Model': cfg.model || '',
  }
}

async function readError(res) {
  let payload = null
  try {
    payload = await res.json()
  } catch (e) {
    payload = null
  }
  const msg = (payload && payload.error && payload.error.message) || ('请求失败（HTTP ' + res.status + '）')
  const code = (payload && payload.error && payload.error.code) || 'UNKNOWN'
  const err = new Error(msg)
  err.code = code
  err.status = res.status
  return err
}

export async function testConnection(cfg) {
  const res = await fetch('/api/models/test', {
    method: 'POST',
    headers: llmHeaders(cfg),
    body: JSON.stringify({ base: cfg.base, model: cfg.model }),
  })
  if (!res.ok) throw await readError(res)
  return res.json()
}

async function streamSSE(res, onDelta) {
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let full = ''
  for (;;) {
    const chunk = await reader.read()
    if (chunk.done) break
    buf += decoder.decode(chunk.value, { stream: true })
    const blocks = buf.split('\n\n')
    buf = blocks.pop()
    for (const block of blocks) {
      const line = block.split('\n').find((l) => l.indexOf('data:') === 0)
      if (!line) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') return full
      let parsed = null
      try {
        parsed = JSON.parse(data)
      } catch (e) {
        continue
      }
      if (parsed && parsed.delta) {
        full += parsed.delta
        if (onDelta) onDelta(parsed.delta, full)
      }
      if (parsed && parsed.error) {
        const err = new Error(parsed.error.message || '模型返回错误')
        err.code = parsed.error.code || 'MODEL_ERROR'
        throw err
      }
    }
  }
  return full
}

export async function analyzeChunk(cfg, chunk, context) {
  const res = await fetch('/api/analyze/chunk', {
    method: 'POST',
    headers: llmHeaders(cfg),
    body: JSON.stringify({ chunk, context }),
  })
  if (!res.ok) throw await readError(res)
  return res.json()
}

export async function analyzeWhole(cfg, text, context, onDelta) {
  const res = await fetch('/api/analyze/whole', {
    method: 'POST',
    headers: llmHeaders(cfg),
    body: JSON.stringify({ text, context }),
  })
  if (!res.ok) throw await readError(res)
  return streamSSE(res, onDelta)
}

export async function summarize(cfg, context, chunkComments, failedChunks, onDelta) {
  const res = await fetch('/api/analyze/summarize', {
    method: 'POST',
    headers: llmHeaders(cfg),
    body: JSON.stringify({ context, chunkComments, failedChunks: failedChunks || [] }),
  })
  if (!res.ok) throw await readError(res)
  return streamSSE(res, onDelta)
}
