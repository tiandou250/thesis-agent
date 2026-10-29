export const SYSTEM_CHUNK = `你是一位严谨的学术论文分析专家，正在分析一篇论文的其中一个章节。

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

export function buildChunkUser(context, chunk) {
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

const REPORT_TEMPLATE = `# 论文分析报告

> **题目**：论文标题
> **类型**：论文类型
> **学科**：学科领域
> **阶段**：当前阶段
> **分析模式**：{MODE}
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

const COMMON_RULES = `【硬性要求】
1. 每条意见必须锚定你收到的原文——引用具体句子，或指明章节位置。禁止出现"论证有待加强""建议进一步完善"这类没有指向的表述。
2. 不要给分数，不要给等级，不要标注问题严重程度。问题按重要性从高到低排列即可。
3. 主要问题最多列 10 条，每条必须能追溯到具体章节。
4. 引用原文时必须来自你收到的材料，不得虚构论文中没有的内容。
5. 如果材料不足以下某个判断，明确写"依据现有材料无法判断"。
6. 不写客套话，不写"总的来说"。
7. 严格遵循下方模板输出，标题层级不得改动。`

export const SYSTEM_WHOLE = `你是一位学术论文分析专家。请分析下面这篇论文，产出一份完整的分析报告。

${COMMON_RULES}

【输出模板】
${REPORT_TEMPLATE.replace('{MODE}', '整篇分析')}`

export function buildWholeUser(context, text) {
  const c = context || {}
  const toc = Array.isArray(c.toc) && c.toc.length ? c.toc.join('\n') : '（未提供）'
  return [
    '【论文信息】',
    '题目：' + (c.title || '未知'),
    '类型：' + (c.type || '未填写'),
    '学科：' + (c.discipline || '未填写'),
    '阶段：' + (c.stage || '未填写'),
    '使用模型：' + (c.model || '未填写'),
    '生成时间：' + (c.generatedAt || ''),
    '结构：',
    toc,
    '',
    '【论文全文】',
    String(text || ''),
  ].join('\n')
}

export const SYSTEM_SUMMARY = `你是一位学术论文分析专家。以下是同一篇论文各章节的分析意见，请据此产出一份完整的论文分析报告。

${COMMON_RULES}

【输出模板】
${REPORT_TEMPLATE.replace('{MODE}', '分章节深度分析（共 N 章）')}`

export function buildSummaryUser(context, chunkComments, failedChunks) {
  const c = context || {}
  const toc = Array.isArray(c.toc) && c.toc.length ? c.toc.join('\n') : '（未提供）'
  const list = chunkComments || []
  const lines = [
    '【论文信息】',
    '题目：' + (c.title || '未知'),
    '类型：' + (c.type || '未填写'),
    '学科：' + (c.discipline || '未填写'),
    '阶段：' + (c.stage || '未填写'),
    '使用模型：' + (c.model || '未填写'),
    '生成时间：' + (c.generatedAt || ''),
    '章数：' + list.length,
    '结构：',
    toc,
    '',
    '【摘要】',
    String(c.abstract || '（未提取到摘要）'),
    '',
    '【各章节分析意见】',
  ]
  for (const item of list) {
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
