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
  if (status === 400 && (lower.indexOf('model') >= 0 || lower.indexOf('不存在') >= 0)) {
    return fail('MODEL_NOT_FOUND', '模型名称不存在，请检查拼写', 400)
  }
  return fail('UPSTREAM_ERROR', '模型服务返回错误（HTTP ' + status + '）', 502)
}

const SYSTEM = `你是一位严谨的学术论文分析专家，正在分析一篇论文的其中一个章节。

【硬性要求】
1. 每条意见必须锚定你收到的原文——引用具体句子，或指出具体段落位置。禁止出现"论证有待加强""建议进一步完善"这类没有指向的表述。
2. 明确区分两类内容：事实性问题（数据错误、引用缺失、前后矛盾、方法描述不清）与改进建议（结构可优化、表达可精炼、补充材料可增强说服力）。
3. 不要给分数，不要给等级，不要标注问题严重程度。只描述问题本身和修改方向。
4. 如果这一部分确实没有明显问题，如实说明，不要凑数编造。
5. 不要写开场白，不要写总结语，直接输出正文。
6. 输出 Markdown，严格使用下方格式：

### 本章问题
- 问题一句话概括
  - 位置：引用原文或指明段落
  - 问题：具体说明
  - 建议：可执行的修改方向

### 本章优点
- 一句话，锚定原文

### 学术规范记录
- 引用格式、图表、术语方面的问题（无则写"未见明显问题"）`

function buildUser(context, chunk) {
  const c = context || {}
  const toc = Array.isArray(c.toc) && c.toc.length ? c.toc.join('\n') : '（未提供）'
  return [
    '【全局信息】',
    '论文题目：' + (c.title || '未知'),
    '学科领域：' + (c.discipline || '未填写'),
    '研究阶段：' + (c.stage || '未填写'),
    '论文类型：' + (c.type || '未填写'),
    '全文结构：',
    toc,
    '',
    '【本次任务】',
    '你收到的是全文中的「' + (chunk.title || '未命名章节') + '」。请只针对这部分内容给出分析意见。',
    '',
    '【章节原文】',
    String(chunk.text || ''),
  ].join('\n')
}

export async function onRequest({ request }) {
  if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED', '仅支持 POST', 405)

  let body = {}
  try {
    body = await request.json()
  } catch (e) {
    return fail('BAD_REQUEST', '请求体不是合法 JSON', 400)
  }

  const base = normalizeBase(request.headers.get('X-LLM-Base'))
  const key = request.headers.get('X-LLM-Key') || ''
  const model = String(request.headers.get('X-LLM-Model') || '').trim()
  const chunk = body.chunk || {}

  if (!base) return fail('INVALID_BASE_URL', '接口地址有误，请检查 Base URL', 400)
  if (!key) return fail('INVALID_API_KEY', '缺少 API Key', 401)
  if (!model) return fail('MODEL_NOT_FOUND', '缺少模型名称', 400)
  if (!chunk.text) return fail('BAD_REQUEST', '缺少章节正文', 400)

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
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: buildUser(body.context, chunk) },
        ],
        temperature: 0.3,
        stream: false,
      }),
    })
  } catch (e) {
    return fail('NETWORK_ERROR', '无法连接到该接口地址，请检查网络或 Base URL', 502)
  }

  if (!res.ok) {
    const text = await res.text()
    return mapUpstreamError(res.status, text)
  }

  let data = null
  try {
    data = await res.json()
  } catch (e) {
    return fail('UPSTREAM_ERROR', '模型返回内容无法解析', 502)
  }

  const choice = data && data.choices && data.choices[0]
  const content = (choice && choice.message && choice.message.content) || ''

  return json({ title: chunk.title || '', comment: content })
}
