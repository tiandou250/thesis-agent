const STORAGE_KEY = 'pa.llm.v1'

export const WINDOW_PRESETS = [8192, 32768, 65536, 131072, 200000, 1000000]

const KNOWN_WINDOWS = [
  [/deepseek/i, 65536],
  [/moonshot|kimi/i, 131072],
  [/qwen/i, 131072],
  [/glm/i, 131072],
  [/doubao|ark/i, 131072],
  [/gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-5/i, 131072],
  [/gpt-3\.5/i, 16385],
  [/ernie|hunyuan|spark/i, 32768],
]

const FALLBACK_WINDOW = 32768

export const DEFAULT_CONFIG = {
  base: 'https://api.deepseek.com/v1',
  key: '',
  model: '',
  window: 0,
}

export function lookupWindow(model) {
  const m = String(model || '')
  for (const [re, w] of KNOWN_WINDOWS) {
    if (re.test(m)) return w
  }
  return 0
}

export function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CONFIG }
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch (e) {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    base: cfg.base || '',
    key: cfg.key || '',
    model: cfg.model || '',
    window: Number(cfg.window) || 0,
  }))
}

export function clearConfig() {
  localStorage.removeItem(STORAGE_KEY)
}

export function isConfigured(cfg) {
  return Boolean(cfg && cfg.base && cfg.key && cfg.model)
}

export function effectiveWindow(cfg) {
  const declared = Number(cfg && cfg.window) || 0
  if (declared > 0) return declared
  return lookupWindow(cfg && cfg.model) || FALLBACK_WINDOW
}

export function estimateTokens(text) {
  const s = String(text || '')
  if (!s) return 0
  let cjk = 0
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    if (code > 0x2e80) cjk++
  }
  const other = s.length - cjk
  return Math.ceil(cjk * 1.5 + other * 0.35)
}

export function precheck(cfg, paperText, outputBudget) {
  const window = effectiveWindow(cfg)
  const budget = outputBudget || 6000
  const need = estimateTokens(paperText) + budget
  const ratio = need / window
  let level = 'ok'
  if (ratio > 1) level = 'overflow'
  else if (ratio > 0.8) level = 'tight'
  return {
    window,
    need,
    budget,
    ratio,
    level,
    declared: Number(cfg && cfg.window) > 0,
    matched: Boolean(lookupWindow(cfg && cfg.model)),
  }
}
