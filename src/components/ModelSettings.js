import { WINDOW_PRESETS } from '../modules/llmConfig.js'
import { testConnection } from '../api/client.js'

export default {
  name: 'ModelSettings',
  props: {
    visible: { type: Boolean, default: false },
    config: { type: Object, required: true },
  },
  emits: ['close', 'save', 'clear'],
  data() {
    return {
      form: { base: '', key: '', model: '', window: 0 },
      testing: false,
      testResult: null,
      showKey: false,
      presets: WINDOW_PRESETS,
    }
  },
  watch: {
    visible(v) {
      if (v) this.reset()
    },
  },
  methods: {
    reset() {
      this.form = {
        base: this.config.base || '',
        key: this.config.key || '',
        model: this.config.model || '',
        window: Number(this.config.window) || 0,
      }
      this.testResult = null
      this.showKey = false
    },
    windowLabel(w) {
      if (w >= 1000000) return w / 1000000 + 'M'
      return w / 1000 + 'K'
    },
    canTest() {
      return Boolean(this.form.base && this.form.key && this.form.model) && !this.testing
    },
    async test() {
      this.testing = true
      this.testResult = null
      try {
        const r = await testConnection(this.form)
        this.testResult = { ok: true, message: r.message || '连接成功，当前模型可用' }
      } catch (e) {
        this.testResult = { ok: false, message: e.message || '连接失败' }
      } finally {
        this.testing = false
      }
    },
  },
  template: `
    <div v-if="visible" class="mp-modal-mask" @click.self="$emit('close')">
      <div class="mp-modal" role="dialog" aria-modal="true" aria-label="模型配置">
        <h3>模型配置</h3>

        <div class="mp-field">
          <label class="mp-label">接口地址（Base URL）</label>
          <input class="mp-input" v-model.trim="form.base" placeholder="https://api.deepseek.com/v1" spellcheck="false" />
          <div class="mp-hint">仅支持 OpenAI 兼容格式，即以 /chat/completions 为终点的接口</div>
        </div>

        <div class="mp-field">
          <label class="mp-label">API Key</label>
          <div style="display:flex;gap:8px">
            <input class="mp-input" :type="showKey ? 'text' : 'password'" v-model.trim="form.key" placeholder="sk-..." spellcheck="false" autocomplete="off" />
            <button class="mp-btn mp-btn--ghost mp-btn--sm" type="button" @click="showKey = !showKey">{{ showKey ? '隐藏' : '显示' }}</button>
          </div>
        </div>

        <div class="mp-field">
          <label class="mp-label">模型名称</label>
          <input class="mp-input" v-model.trim="form.model" placeholder="deepseek-chat" spellcheck="false" />
        </div>

        <div class="mp-field">
          <label class="mp-label">上下文窗口（选填）</label>
          <select class="mp-select" v-model.number="form.window">
            <option :value="0">自动识别</option>
            <option v-for="w in presets" :key="w" :value="w">{{ windowLabel(w) }} tokens</option>
          </select>
          <div class="mp-hint">不确定就留「自动识别」，分析前会据此检查论文能否装得下</div>
        </div>

        <div class="mp-secure">
          密钥只保存在你的浏览器里。分析时它会随请求经过我们的服务器完成转发，我们不记录、不落盘、不做任何留存。
        </div>

        <div v-if="testResult" class="mp-alert" :class="testResult.ok ? 'mp-alert--ok' : 'mp-alert--error'">
          {{ testResult.message }}
        </div>

        <div class="mp-actions">
          <button class="mp-btn" type="button" @click="test" :disabled="!canTest()">
            {{ testing ? '测试中…' : '测试连接' }}
          </button>
          <button class="mp-btn mp-btn--ghost" type="button" @click="$emit('save', { ...form })">保存</button>
          <button class="mp-btn mp-btn--ghost" type="button" @click="$emit('close')">关闭</button>
          <button class="mp-btn mp-btn--pink mp-btn--sm" type="button" style="margin-left:auto" @click="$emit('clear')">清除配置</button>
        </div>
      </div>
    </div>
  `,
}
