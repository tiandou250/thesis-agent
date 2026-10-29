function fail(code, message, status) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status: status || 400,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
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

function toSimpleStream(upstream) {
  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buf = ''
  return new ReadableStream({
    async pull(controller) {
      for (;;) {
        let step
        try {
          step = await reader.read()
        } catch (e) {
          controller.close()
          return
        }
        if (step.done) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
          return
        }
        buf += decoder.decode(step.value, { stream: true })
        const blocks = buf.split('\n\n')
        buf = blocks.pop()
        let out = ''
        for (const block of blocks) {
          const line = block.split('\n').find((l) => l.indexOf('data:') === 0)
          if (!line) continue
          const payload = line.slice(5).trim()
          if (payload === '[DONE]') continue
          try {
            const j = JSON.parse(payload)
            const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content
            if (delta) out += 'data: ' + JSON.stringify({ delta }) + '\n\n'
          } catch (e) {}
        }
        if (out) {
          controller.enqueue(encoder.encode(out))
          return
        }
      }
    },
    cancel() {
      try {
        reader.cancel()
      } catch (e) {}
    },
  })
}

const SYSTEM = `你是一位学术论文分析专家。以下是同一篇论文各章节的分析意见，请据此产出一份完整的论文分析报告。

【硬性要求】
1. 跨章节的整体性判断（选题价值、创新性、逻辑自洽、工作量）只能基于上述材料推断。若信息不足，明确写"依据现有材料无法判断"，不得编造。
2. 不要给分数，不要给等级，不要标注严重程度。问题按重要性从高到低排列即可。
3. 主要问题最多列 10 条，每条必须能追溯到具体章节。
4. 引用原文时必须来自材料，不得虚构论文中没有的内容。
5. 不写客套话，不写"总的来说"。
6. 严格遵循下方模板输出，标题层级不得改动。

【输出模板】
# 论文分析报告

> **题目**：论文标题
> **类型**：论文类型
> **学科**：学科领域
> **阶段**：当前阶段
> **分析模式**：分章节深度分析（共 N 章）
> **使用模型**：模型名称
> **生成时间**：时间

## 一、总体评价

150 到 250 字。说明整体水平、最突出的优点、最需要优先解决的问题。不许空泛。

## 二、主要问题

### 1. 问题标题

- **位置**：具体章节
- **原文**："引用原文"
- **问题**：具体说明
- **建议**：可执行的修改方向

## 三、分章节意见

### 章节名

该章节的意见

## 四、修改建议清单

- [ ] 待办事项

---

*本报告由 AI 生成，仅作为写作自检参考，不能替代导师或评审专家的专业意见。*`

function buildUser(context, chunkComments, failedChunks) {
  const c = context || {}
  const toc = Array.isArray(c.toc) && c.toc.length ? c.toc.join('\n') : '（未提供）'
  const lines = [
    '【论文信息】',
    '题目：' + (c.title || '未知'),
    '类型：' + (c.type || '未填写'),
    '学科：' + (c.discipline || '未填写'),
    '阶段：' + (c.stage || '未填写'),
    '使用模型：' + (c.model || '未填写'),
    '生成时间：' + (c.generatedAt || ''),
    '章数：' + (chunkComments || []).length,
    '结构：',
    toc,
    '',
    '【摘要】',
    String(c.abstract || '（未提取到摘要）'),
    '',
    '【各章节分析意见】',
  ]
  for (const item of chunkComments || []) {
    lines.push('')
    lines.push('===== ' + (item.title || '未命名章节') + ' =====')
    lines.push(String(item.comment || '（本章分析失败，无意见）'))
  }
  if (failedChunks && failedChunks.length) {
    lines.push('')
    lines.push('【分析失败的章节】')
    lines.push(failedChunks.join('、') + '（请在报告中说明这些章节未能分析）')
  }
  return lines.join('\n')
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

  if (!base) return fail('INVALID_BASE_URL', '接口地址有误，请检查 Base URL', 400)
  if (!key) return fail('INVALID_API_KEY', '缺少 API Key', 401)
  if (!model) return fail('MODEL_NOT_FOUND', '缺少模型名称', 400)

  const chunkComments = body.chunkComments || []
  if (!chunkComments.length) return fail('BAD_REQUEST', '缺少章节分析结果', 400)

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
          { role: 'user', content: buildUser(body.context, chunkComments, body.failedChunks) },
        ],
        temperature: 0.3,
        stream: true,
      }),
    })
  } catch (e) {
    return fail('NETWORK_ERROR', '无法连接到该接口地址，请检查网络或 Base URL', 502)
  }

  if (!res.ok) {
    const text = await res.text()
    return mapUpstreamError(res.status, text)
  }

  return new Response(toSimpleStream(res), {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
}
