import BrandCard from './BrandCard.js'
import DisclaimerBar from './DisclaimerBar.js'
import ModelSettings from './ModelSettings.js'
import ProgressBar from './ProgressBar.js'
import ReportView from './ReportView.js'
import {
  loadConfig,
  saveConfig,
  clearConfig,
  isConfigured,
  precheck,
  estimateTokens,
  DEFAULT_CONFIG,
} from '../modules/llmConfig.js'
import {
  splitIntoChunks,
  extractTitle,
  extractAbstract,
  buildChunkCountHint,
} from '../modules/chunker.js'
import { downloadMarkdown, copyText, safeFilename, todayStamp } from '../modules/report.js'
import { analyzeChunk, analyzeWhole, summarize } from '../api/client.js'
import { parseFile } from '../modules/parser.js'

const TYPES = ['本科毕业论文', '硕士学位论文', '博士学位论文', '期刊投稿', '其他']
const STAGES = ['开题', '初稿', '修改稿', '终稿']

function fmtTokens(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + ' 万'
  if (n >= 1000) return (n / 1000).toFixed(1) + ' 千'
  return String(n)
}

export default {
  name: 'App',
  components: { BrandCard, DisclaimerBar, ModelSettings, ProgressBar, ReportView },
  data() {
    return {
      config: { ...DEFAULT_CONFIG },
      settingsOpen: false,
      paperText: '',
      form: { type: '硕士学位论文', discipline: '', stage: '初稿' },
      types: TYPES,
      stages: STAGES,
      running: false,
      parsing: false,
      dragOver: false,
      fileName: '',
      stageLabel: '',
      percent: 0,
      report: '',
      error: '',
      notice: '',
    }
  },
  computed: {
    configured() {
      return isConfigured(this.config)
    },
    estTokens() {
      return estimateTokens(this.paperText)
    },
    estTokensLabel() {
      return fmtTokens(this.estTokens)
    },
    charCount() {
      return this.paperText.length
    },
  },
  created() {
    this.config = loadConfig()
  },
  mounted() {
    const stop = (e) => e.preventDefault()
    window.addEventListener('dragover', stop)
    window.addEventListener('drop', stop)
  },
  methods: {
    openSettings() {
      this.settingsOpen = true
    },
    onSave(cfg) {
      this.config = { ...this.config, ...cfg }
      saveConfig(this.config)
      this.settingsOpen = false
      this.notice = ''
    },
    onClear() {
      clearConfig()
      this.config = { ...DEFAULT_CONFIG }
      this.settingsOpen = false
    },
    reset() {
      this.paperText = ''
      this.fileName = ''
      this.report = ''
      this.error = ''
      this.notice = ''
      this.percent = 0
      this.stageLabel = ''
    },
    pickFile() {
      if (this.running || this.parsing) return
      const el = this.$refs.fileInput
      if (el) el.click()
    },
    onFileChange(e) {
      const file = e.target.files && e.target.files[0]
      e.target.value = ''
      this.handleFile(file)
    },
    onDragOver() {
      if (this.running || this.parsing) return
      this.dragOver = true
    },
    onDragLeave(e) {
      if (!e.currentTarget.contains(e.relatedTarget)) this.dragOver = false
    },
    onDrop(e) {
      this.dragOver = false
      if (this.running || this.parsing) return
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
      this.handleFile(file)
    },
    clearFile() {
      this.fileName = ''
      this.paperText = ''
      this.report = ''
      this.notice = ''
    },
    async handleFile(file) {
      if (!file || this.running) return
      this.parsing = true
      this.error = ''
      this.notice = ''
      this.stageLabel = '正在解析文件…'
      try {
        const r = await parseFile(file, (msg) => {
          this.stageLabel = msg
        })
        this.paperText = r.text
        this.fileName = r.name
        this.report = ''
        this.notice = r.warnings.join(' ')
      } catch (err) {
        this.error = (err && err.message) || '文件解析失败'
      } finally {
        this.parsing = false
        this.stageLabel = ''
      }
    },
    async start() {
      if (this.running) return
      this.error = ''
      this.notice = ''
      this.report = ''
      this.percent = 0

      const text = this.paperText.trim()
      if (!text) {
        this.error = '请先粘贴论文正文。'
        return
      }
      if (!this.configured) {
        this.error = '还没配置模型 API，请先点右上角齿轮填写接口地址、密钥与模型名称。'
        this.settingsOpen = true
        return
      }
      if (text.length < 800) {
        this.error = '内容过短（少于 800 字），可能不是完整论文。请确认后重试。'
        return
      }

      const pc = precheck(this.config, text)
      if (pc.level === 'overflow') {
        this.error =
          '当前模型的上下文窗口不足。这篇论文约需 ' +
          fmtTokens(pc.need) +
          ' tokens，而模型窗口约 ' +
          fmtTokens(pc.window) +
          ' tokens。请更换窗口更大的模型，或把论文拆成几部分分别分析。'
        return
      }
      if (pc.level === 'tight') {
        this.notice = '论文较长，将自动按章节分块分析，预计需要 1 分钟左右。'
      }

      const perChunkTokens = Math.floor(pc.window * 0.6)
      const maxChars = Math.max(4000, Math.floor(perChunkTokens / 1.5))
      let chunks = splitIntoChunks(text, { maxChars })
      if (!chunks.length) chunks = [{ title: '全文', text }]

      const context = {
        title: extractTitle(text) || '未命名论文',
        abstract: extractAbstract(text),
        toc: chunks.map((c) => c.title),
        type: this.form.type,
        discipline: this.form.discipline,
        stage: this.form.stage,
        model: this.config.model,
        generatedAt: todayStamp(),
      }

      this.running = true
      try {
        if (chunks.length === 1) {
          this.stageLabel = '正在分析全文…'
          this.percent = 4
          await analyzeWhole(this.config, text, context, (delta) => {
            this.report += delta
            this.percent = Math.max(this.percent, Math.min(95, Math.round(this.report.length / 40)))
          })
          this.percent = 100
          this.stageLabel = '分析完成'
        } else {
          const total = chunks.length
          let done = 0
          const results = new Array(total)
          const failed = []
          this.stageLabel = '正在分析第 0 / ' + total + ' 章…'
          await Promise.all(
            chunks.map((chunk, i) =>
              analyzeChunk(this.config, chunk, context)
                .then((r) => {
                  results[i] = { title: chunk.title, comment: (r && r.comment) || '' }
                })
                .catch(() => {
                  failed.push(chunk.title)
                  results[i] = { title: chunk.title, comment: '' }
                })
                .then(() => {
                  done++
                  this.stageLabel = '正在分析第 ' + done + ' / ' + total + ' 章…'
                  this.percent = Math.round((done / (total + 1)) * 100)
                })
            )
          )
          if (failed.length === total) {
            throw new Error('所有章节分析均失败，请检查模型配置后重试。')
          }
          const kept = results.filter((r) => r && r.comment)
          this.stageLabel = '正在汇总生成报告…'
          this.percent = Math.round((total / (total + 1)) * 100)
          await summarize(this.config, context, kept, failed, (delta) => {
            this.report += delta
          })
          this.percent = 100
          this.stageLabel = '报告生成完成'
          if (failed.length) {
            this.notice = '以下章节分析失败，未计入报告：' + failed.join('、')
          }
        }
      } catch (e) {
        this.error = (e && e.message) || '分析失败，请稍后重试。'
      } finally {
        this.running = false
      }
    },
    downloadReport() {
      if (!this.report) return
      const name = safeFilename(extractTitle(this.paperText) || '论文')
      downloadMarkdown('论文分析报告-' + name + '.md', this.report)
    },
    async copyReport() {
      if (!this.report) return
      const ok = await copyText(this.report)
      this.notice = ok ? '报告已复制到剪贴板。' : '复制失败，请手动选择文本复制。'
    },
  },
  template: `
    <div>
      <BrandCard />
      <button class="mp-gear" type="button" aria-label="模型配置" @click="openSettings">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111827" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      </button>
      <span v-if="config.model" class="mp-model-tag" @click="openSettings" :title="config.model">{{ config.model }}</span>

      <div class="mp-shell">
        <div class="mp-deco">
          <span style="background:#EC4899"></span>
          <span style="background:#22D3EE"></span>
          <span style="background:#34D399"></span>
        </div>
        <h1 class="mp-title">论文分析小助手</h1>
        <p class="mp-subtitle">粘贴论文全文，用自己的模型生成一份锚定原文的分析报告。全程不保存，关闭页面即清空。</p>

        <div class="mp-panel">
          <input ref="fileInput" type="file" accept=".docx,.pdf,.txt,.md" style="display:none" @change="onFileChange" />

          <div class="mp-drop"
            :class="{ 'is-over': dragOver, 'is-busy': parsing }"
            @click="pickFile"
            @dragover.prevent="onDragOver"
            @dragenter.prevent="onDragOver"
            @dragleave.prevent="onDragLeave"
            @drop.prevent="onDrop">
            <div class="mp-drop__title">{{ parsing ? '正在解析文件，请稍候…' : '把论文拖到这里' }}</div>
            <div class="mp-drop__hint">支持 .docx / .pdf / .txt / .md，也可以点击选择文件</div>
          </div>

          <div v-if="fileName" class="mp-file">
            <span>已载入：{{ fileName }}</span>
            <button class="mp-btn mp-btn--ghost mp-btn--sm" type="button" @click.stop="clearFile">移除</button>
          </div>

          <div class="mp-or">或直接粘贴文本</div>

          <div class="mp-field">
            <label class="mp-label" for="paper">论文正文</label>
            <textarea id="paper" class="mp-textarea" v-model="paperText" :disabled="running"
              placeholder="把论文全文粘贴到这里。带有「第 X 章」「一、」「1.1」这类标题行效果更好，系统会据此分章节分析。"></textarea>
            <div class="mp-kv">
              <span>{{ charCount }} 字</span>
              <span>预计约 {{ estTokensLabel }} tokens</span>
            </div>
          </div>

          <div class="mp-row">
            <div class="mp-field">
              <label class="mp-label">论文类型</label>
              <select class="mp-select" v-model="form.type" :disabled="running">
                <option v-for="t in types" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
            <div class="mp-field">
              <label class="mp-label">学科领域（选填）</label>
              <input class="mp-input" v-model.trim="form.discipline" :disabled="running" placeholder="如：教育技术学" />
            </div>
            <div class="mp-field">
              <label class="mp-label">当前阶段</label>
              <select class="mp-select" v-model="form.stage" :disabled="running">
                <option v-for="s in stages" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
          </div>

          <div class="mp-actions">
            <button class="mp-btn" type="button" :disabled="running" @click="start">
              {{ running ? '分析中…' : '开始分析' }}
            </button>
            <button class="mp-btn mp-btn--ghost" type="button" :disabled="running" @click="reset">清空</button>
          </div>

          <div v-if="!configured" class="mp-alert mp-alert--warn" style="margin-bottom:0">
            还没配置模型 API。点右上角齿轮，填入接口地址、API Key 和模型名称后即可开始。
          </div>
        </div>

        <div v-if="error" class="mp-alert mp-alert--error">{{ error }}</div>
        <div v-if="notice" class="mp-alert mp-alert--info">{{ notice }}</div>

        <div v-if="running" class="mp-panel">
          <ProgressBar :label="stageLabel" :percent="percent" />
        </div>

        <ReportView v-if="report" :markdown="report" :streaming="running"
          @download="downloadReport" @copy="copyReport" />

        <ModelSettings :visible="settingsOpen" :config="config"
          @close="settingsOpen = false" @save="onSave" @clear="onClear" />

        <DisclaimerBar />
      </div>
    </div>
  `,
}
