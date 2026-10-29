import {
  SYSTEM_CHUNK,
  buildChunkUser,
  SYSTEM_WHOLE,
  buildWholeUser,
  SYSTEM_SUMMARY,
  buildSummaryUser,
} from '../modules/prompts.js'

function joinUrl(base, path) {
  const b = String(base || '').trim().replace(/\/+$/, '')
  return b + path
}

function makeError(message, code) {
  const e = new Error(message)
  e.code = code
  return e
}

function mapHttpError(status, text) {
  const lower = String(text || '').toLowerCase()
  if (status === 401 || status === 403) return makeError('密钥无效或已过期', 'INVALID_API_KEY')
  if (status === 404) return makeError('接口地址有误，请检查 Base URL', 'INVALID_BASE_URL')
  if (status === 402 || status === 429) return makeError('账户额度不足或触发限流，请检查你的 API 账户', 'QUOTA_EXCEEDED')
  if (status === 400 && (lower.indexOf('model') >= 0 || lower.indexOf('不存在') >= 0)) {
    return makeError('模型名称不存在，请检查拼写', 'MODEL_NOT_FOUND')
  }
  return makeError('模型服务返回错误（HTTP ' + status + '）', 'UPSTREAM_ERROR')
}

function corsError() {
  return makeError(
    '浏览器拦下了这个请求（跨域限制），多半是这家服务不允许网页直连。请换用支持直连的服务（DeepSeek / Kimi / 硅基流动），或填写一个允许跨域的代理地址。',
    'CORS_BLOCKED'
  )
}

async function post(cfg, body) {
  const url = joinUrl(cfg.base, '/chat/completions')
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (cfg.key || ''),
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    throw corsError()
  }
  if (!res.ok) {
    const text = await res.text().catch(function () {
      return ''
    })
    throw mapHttpError(res.status, text)
  }
  return res
}

export async function testConnection(cfg) {
  const started = Date.now()
  const res = await post(cfg, {
    model: cfg.model,
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 4,
    stream: false,
  })
  await res.json()
  return { ok: true, message: '连接成功，当前模型可用', latencyMs: Date.now() - started }
}

async function readSSE(res, onDelta) {
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
      const line = block.split('\n').find(function (l) {
        return l.indexOf('data:') === 0
      })
      if (!line) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return full
      let parsed = null
      try {
        parsed = JSON.parse(payload)
      } catch (e) {
        continue
      }
      const delta = parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].delta
      if (delta && delta.content) {
        full += delta.content
        if (onDelta) onDelta(delta.content, full)
      }
    }
  }
  return full
}

export async function analyzeChunk(cfg, chunk, context) {
  const res = await post(cfg, {
    model: cfg.model,
    messages: [
      { role: 'system', content: SYSTEM_CHUNK },
      { role: 'user', content: buildChunkUser(context, chunk) },
    ],
    temperature: 0.3,
    stream: false,
  })
  const data = await res.json()
  const choice = data && data.choices && data.choices[0]
  const comment = (choice && choice.message && choice.message.content) || ''
  return { title: chunk.title || '', comment: comment }
}

export async function analyzeWhole(cfg, text, context, onDelta) {
  const res = await post(cfg, {
    model: cfg.model,
    messages: [
      { role: 'system', content: SYSTEM_WHOLE },
      { role: 'user', content: buildWholeUser(context, text) },
    ],
    temperature: 0.3,
    stream: true,
  })
  return readSSE(res, onDelta)
}

export async function summarize(cfg, context, chunkComments, failedChunks, onDelta) {
  const res = await post(cfg, {
    model: cfg.model,
    messages: [
      { role: 'system', content: SYSTEM_SUMMARY },
      { role: 'user', content: buildSummaryUser(context, chunkComments, failedChunks) },
    ],
    temperature: 0.3,
    stream: true,
  })
  return readSSE(res, onDelta)
}
