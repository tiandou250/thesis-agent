export default {
  name: 'BrandCard',
  data() {
    return { showAuthor: false }
  },
  methods: {
    toggle() {
      this.showAuthor = !this.showAuthor
    },
  },
  template: `
    <button class="mp-brand" type="button" @click="toggle" :aria-label="showAuthor ? '收起作者信息' : '查看作者信息'">
      {{ showAuthor ? 'tiandou250 制作' : '论文分析小助手' }}
    </button>
  `,
}
