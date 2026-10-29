function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function fail(code, message, status) {
  return json({ error: { code, message } }, status || 400)
}

function normalizeBase(base) {
  const b = String(base || '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(b)) return ''
  return b
}

function mapUpstreamError(status, text) {
  const lower = String(text || '').toLowerCase()
  if (status === 401 || status === 403) return fail('INVALID_API_KEY', '密钥无效或已过期', 401)
  if (status === 404) return fail('INVALID_BASE_URL', '接口地址有误，请检查 Base URL', 404)
  if (status === 402 || status === 429) return fail('QUOTA_EXCEEDED', '账户额度不足或触发限流，请检查你的 API 账户', 429)
  if (status === 400 && (lower.indexOf('model') >= 0 || lower.indexOf('\u4e0d\u5b58\u5728') >= 0)) {
    return fail('MODEL_NOT_FOUND', '模型名称不存在，请检查拼写', 400)
  }
  return fail('UPSTREAM_ERROR', '模型服务返回错误（HTTP ' + status + '）', 502)
}

export async function onRequest({ request }) {
  if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED', '仅支持 POST', 405)

  let body = {}
  try {
    body = await request.json()
  } catch (e) {
    return fail('BAD_REQUEST', '请求体不是合法 JSON', 400)
  }

  const base = normalizeBase(body.base || request.headers.get('X-LLM-Base'))
  const key = request.headers.get('X-LLM-Key') || ''
  const model = String(body.model || request.headers.get('X-LLM-Model') || '').trim()

  if (!base) return fail('INVALID_BASE_URL', '接口地址有误，请检查 Base URL', 400)
  if (!key) return fail('INVALID_API_KEY', '缺少 API Key', 400)
  if (!model) return fail('MODEL_NOT_FOUND', '缺少模型名称', 400)

  const started = Date.now()
  let res
  try {
    res = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 4,
        stream: false,
      }),
    })
  } catch (e) {
    return fail('NETWORK_ERROR', '无法连接到该接口地址，请检查网络或 Base URL', 502)
  }

  const text = await res.text()
  if (!res.ok) return mapUpstreamError(res.status, text)

  return json({ ok: true, message: '连接成功，当前模型可用', latencyMs: Date.now() - started })
}
