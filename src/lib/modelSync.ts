export type ModelConfig = {
  id?: string
  name?: string
  family?: string
  [key: string]: unknown
}

export type ModelDiff = {
  adds: string[]
  dels: string[]
  keep: number
  orderChanged: boolean
  nameChanged: boolean
  dirty: boolean
}

const MEDIA_RULES: Array<[RegExp, string]> = [
  [
    /image|vision|seedream|flux|midjourney|dall|gpt-image|veo|sora|video|tts|speech|whisper|suno|music|embedding|rerank|ocr/i,
    'media',
  ],
]

const FAMILY_RULES: Array<[RegExp, string]> = [
  [/^claude/i, 'claude'],
  [/^gpt|^o\d|^openai\//i, 'openai'],
  [/^gemini|^google\//i, 'gemini'],
  [/^grok/i, 'grok'],
  [/^kimi|^moonshot/i, 'kimi'],
  [/^deepseek/i, 'deepseek'],
  [/^qwen|^Qwen\//i, 'qwen'],
  [/^doubao|^ByteDance\//i, 'doubao'],
  [/^glm|^zai-org\//i, 'glm'],
  [/^MiniMax/i, 'minimax'],
]

const VISION_RE =
  /^(claude|gpt|o3|o4|gemini|grok|kimi|mimo|moonshot|google\/gemma|qwen.*vl|doubao-seed|glm-?\d*v|ernie.*vl|zai-org\/glm-4\.\dv)/i

export const DEFAULT_PROVIDER_KEY = 'ucloud'
export const MODELVERSE_API = 'https://api.modelverse.cn/v1/models'

export const FALLBACK_MODELS = [
  'grok-4.5',
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'gpt-5.4',
  'gpt-5.1',
  'gemini-3.5-flash',
  'deepseek-v4-pro',
  'kimi-k2.7-code',
  'qwen3.7-plus',
  'glm-5.2',
]

export function mediaTag(id: string): string | null {
  for (const [re, tag] of MEDIA_RULES) {
    if (re.test(id)) return tag
  }
  return null
}

export function familyOf(id: string): string {
  for (const [re, family] of FAMILY_RULES) {
    if (re.test(id)) return family
  }
  return id.split(/[-/]/)[0]?.toLowerCase() || 'other'
}

export function genConfig(id: string): ModelConfig {
  const vision = VISION_RE.test(id)
  return {
    id,
    name: id,
    family: familyOf(id),
    ...(vision ? { modalities: { input: ['text', 'image'], output: ['text'] } } : {}),
  }
}

export function stripJsonc(input: string): string {
  let out = ''
  let inStr = false
  let esc = false
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i]
    const n = input[i + 1]
    if (inStr) {
      out += c
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') {
      inStr = true
      out += c
      continue
    }
    if (c === '/' && n === '/') {
      while (i < input.length && input[i] !== '\n') i += 1
      out += '\n'
      continue
    }
    if (c === '/' && n === '*') {
      i += 2
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) i += 1
      i += 1
      continue
    }
    out += c
  }
  return out.replace(/,\s*([}\]])/g, '$1')
}

function matchBrace(text: string, open: number): number {
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = open; i < text.length; i += 1) {
    const c = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (!depth) return i
    }
  }
  return -1
}

function findKeyBlock(
  text: string,
  objOpen: number,
  objClose: number,
  key: string,
): { keyStart: number; open: number; close: number } | null {
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = objOpen; i <= objClose; i += 1) {
    const c = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') {
      inStr = true
      if (depth === 1 && text.startsWith(`"${key}"`, i)) {
        let j = i + key.length + 2
        while (j < text.length && /\s/.test(text[j] ?? '')) j += 1
        if (text[j] === ':') {
          j += 1
          while (j < text.length && /\s/.test(text[j] ?? '')) j += 1
          if (text[j] === '{') {
            const close = matchBrace(text, j)
            if (close > 0) return { keyStart: i, open: j, close }
          }
        }
      }
      continue
    }
    if (c === '{') depth += 1
    else if (c === '}') depth -= 1
  }
  return null
}

export function locateModels(
  text: string,
  providerKey: string,
): { keyStart: number; open: number; close: number } | null {
  const pIdx = text.indexOf(`"${providerKey}"`)
  if (pIdx < 0) return null
  const pOpen = text.indexOf('{', pIdx)
  if (pOpen < 0) return null
  const pClose = matchBrace(text, pOpen)
  if (pClose < 0) return null
  return findKeyBlock(text, pOpen, pClose, 'models')
}

export function parseConfiguredModels(text: string, providerKey: string): Map<string, ModelConfig> {
  const cfg = JSON.parse(stripJsonc(text)) as {
    provider?: Record<string, { models?: Record<string, ModelConfig> }>
  }
  const models = cfg.provider?.[providerKey]?.models
  if (!models || typeof models !== 'object') {
    throw new Error(`配置中未找到 provider.${providerKey}.models`)
  }
  return new Map(Object.entries(models))
}

export function displayNameOf(
  id: string,
  configured: Map<string, ModelConfig>,
  nameOverrides: Map<string, string>,
): string {
  if (nameOverrides.has(id)) return nameOverrides.get(id) ?? id
  const cfg = configured.get(id)
  if (cfg?.name) return cfg.name
  return id
}

export function diffModels(
  selected: string[],
  baselineOrder: string[],
  configured: Map<string, ModelConfig>,
  nameOverrides: Map<string, string>,
): ModelDiff {
  const base = new Set(configured.keys())
  const adds = selected.filter((id) => !base.has(id))
  const dels = [...base].filter((id) => !selected.includes(id))
  const keep = selected.length - adds.length
  const orderChanged =
    selected.length !== baselineOrder.length || selected.some((id, i) => baselineOrder[i] !== id)

  let nameChanged = false
  for (const id of selected) {
    if (!configured.has(id)) continue
    const cur = displayNameOf(id, configured, nameOverrides)
    const orig = configured.get(id)?.name || id
    if (cur !== orig) nameChanged = true
  }

  return {
    adds,
    dels,
    keep,
    orderChanged,
    nameChanged,
    dirty: adds.length > 0 || dels.length > 0 || orderChanged || nameChanged,
  }
}

export function buildNewModels(
  selected: string[],
  configured: Map<string, ModelConfig>,
  nameOverrides: Map<string, string>,
): Map<string, ModelConfig> {
  const map = new Map<string, ModelConfig>()
  for (const id of selected) {
    const base = configured.has(id) ? { ...(configured.get(id) as ModelConfig) } : genConfig(id)
    base.id = id
    base.name = displayNameOf(id, configured, nameOverrides)
    if (!base.family) base.family = familyOf(id)
    map.set(id, base)
  }
  return map
}

function buildModelsBlock(models: Map<string, ModelConfig>, indent: number): string {
  const pad = ' '.repeat(indent)
  const pad2 = ' '.repeat(indent + 2)
  const lines = [...models.entries()].map(([id, cfg]) => {
    const body = JSON.stringify(cfg, null, 2)
      .split('\n')
      .map((line, index) => (index ? pad2 + line : line))
      .join('\n')
    return `${pad2}${JSON.stringify(id)}: ${body}`
  })
  return `"models": {${lines.length ? `\n${lines.join(',\n')}\n${pad}}` : '}'}`
}

export function generateModelsText(
  fileText: string,
  providerKey: string,
  selected: string[],
  configured: Map<string, ModelConfig>,
  nameOverrides: Map<string, string>,
): string {
  const span = locateModels(fileText, providerKey)
  if (!span) {
    throw new Error(`未能在配置文本中定位 provider.${providerKey}.models`)
  }
  const pIdx = fileText.indexOf(`"${providerKey}"`)
  const pOpen = fileText.indexOf('{', pIdx)
  const firstKey = fileText.indexOf('"', pOpen + 1)
  const indent = firstKey - (fileText.lastIndexOf('\n', firstKey) + 1)
  const block = buildModelsBlock(
    buildNewModels(selected, configured, nameOverrides),
    Math.max(indent, 0),
  )
  const lineStart = fileText.lastIndexOf('\n', span.keyStart) + 1
  const newText =
    fileText.slice(0, lineStart) +
    ' '.repeat(Math.max(indent, 0)) +
    block +
    fileText.slice(span.close + 1)

  const parsed = JSON.parse(stripJsonc(newText)) as {
    provider: Record<string, { models: Record<string, unknown> }>
  }
  const keys = Object.keys(parsed.provider[providerKey]?.models ?? {})
  if (keys.length !== selected.length) {
    throw new Error('写入校验失败：模型数不一致')
  }
  if (keys.some((key, index) => key !== selected[index])) {
    throw new Error('写入校验失败：顺序不一致')
  }
  return newText
}

export type RemoteModel = {
  id: string
  /** unix 秒 */
  created?: number
}

/** 保持接口返回顺序（新模型在前），不重排 */
export async function fetchRemoteModels(): Promise<RemoteModel[]> {
  const response = await fetch(MODELVERSE_API)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  const data = (await response.json()) as {
    data?: Array<{ id?: string; created?: number }>
  }
  if (!Array.isArray(data.data) || data.data.length === 0) {
    throw new Error('返回格式异常')
  }
  const result: RemoteModel[] = []
  for (const item of data.data) {
    if (!item?.id) continue
    result.push({
      id: item.id,
      created: typeof item.created === 'number' ? item.created : undefined,
    })
  }
  return result
}

/** 时间戳转短日期：2026-07-27 */
export function formatModelDate(created?: number): string {
  if (!created || created <= 0) return ''
  // 兼容秒 / 毫秒
  const ms = created > 1e12 ? created : created * 1000
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
