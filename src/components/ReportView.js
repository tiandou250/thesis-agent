import { renderMarkdown } from '../modules/report.js'

export default {
  name: 'ReportView',
  props: {
    markdown: { type: String, default: '' },
    streaming: { type: Boolean, default: false },
  },
  emits: ['download', 'copy'],
  computed: {
    html() {
      return renderMarkdown(this.markdown)
    },
  },
  template: `
    <div>
      <div class="mp-actions" style="margin-top:0;margin-bottom:14px">
        <button class="mp-btn" type="button" :disabled="streaming || !markdown" @click="$emit('download')">下载 .md</button>
        <button class="mp-btn mp-btn--ghost" type="button" :disabled="streaming || !markdown" @click="$emit('copy')">复制全文</button>
        <span class="mp-hint" v-if="streaming">正在生成报告…</span>
      </div>
      <div class="mp-report" v-html="html"></div>
    </div>
  `,
}
