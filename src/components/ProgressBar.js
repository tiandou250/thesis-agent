export default {
  name: 'ProgressBar',
  props: {
    label: { type: String, default: '' },
    percent: { type: Number, default: 0 },
  },
  computed: {
    safePercent() {
      return Math.max(0, Math.min(100, Math.round(this.percent)))
    },
  },
  template: `
    <div>
      <div class="mp-progress">
        <div class="mp-progress__bar" :style="{ width: safePercent + '%' }"></div>
        <div class="mp-progress__text">{{ safePercent }}%</div>
      </div>
      <div class="mp-hint">{{ label }}</div>
    </div>
  `,
}
