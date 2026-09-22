import path from "node:path"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { Effect, Schema } from "effect"
import { Tool } from "./tool"

const Parameters = Schema.Struct({
  visual_type: Schema.Literals(["chart", "timeline", "flow", "grid", "compare", "concept"]),
  title: Schema.optional(Schema.String),
  data: Schema.optional(Schema.Unknown),
  description: Schema.optional(Schema.String),
  palette: Schema.optional(Schema.Unknown),
  width: Schema.optional(Schema.Number),
  height: Schema.optional(Schema.Number),
  output_path: Schema.String,
})

type VisualType = Schema.Schema.Type<typeof Parameters>["visual_type"]
type Palette = {
  primary: string
  secondary: string
  accent: string
  background: string
  text: string
  muted: string
}

type Input = {
  visual_type: VisualType
  title?: string
  data?: unknown
  description?: string
  palette?: unknown
  width?: number
  height?: number
  output_path: string
}

export const SlideVisualTool = Tool.define(
  "slide_visual",
  Effect.succeed({
    description:
      "为新建演示文稿生成本地、无外链、无渐变的 SVG 矢量图。支持 chart、timeline、flow、grid、compare；concept 应由主流程直接写 SVG。必须传入不存在的绝对输出路径。",
    parameters: Parameters,
    execute: (params: Input, ctx: Tool.Context) =>
      Effect.gen(function* () {
        if (!path.isAbsolute(params.output_path)) return yield* Effect.fail(new Error("output_path 必须是绝对路径。"))
        yield* ctx.ask({
          permission: "edit",
          patterns: [params.output_path],
          always: [params.output_path],
          metadata: { purpose: "生成演示文稿所需的本地 SVG 矢量图" },
        })
        const result = yield* Effect.tryPromise({
          try: () => renderSlideVisual(params),
          catch: (error) => (error instanceof Error ? error : new Error(String(error))),
        }).pipe(Effect.orDie)
        return {
          title: `生成 ${path.basename(result.path)}`,
          output: JSON.stringify(result),
          metadata: result,
        }
      }).pipe(Effect.orDie),
  }),
)

export async function renderSlideVisual(input: Input) {
  if (input.visual_type === "concept") {
    throw new Error("concept 类型不做确定性兜底；请由主流程模型直接写入自包含 SVG。")
  }
  const width = integer(input.width ?? 1200, "width", 320, 4096)
  const height = integer(input.height ?? 675, "height", 240, 2160)
  if (!path.isAbsolute(input.output_path)) throw new Error("output_path 必须是绝对路径。")
  if (path.extname(input.output_path).toLowerCase() !== ".svg") throw new Error("output_path 必须以 .svg 结尾。")
  if ((await stat(input.output_path).catch(() => undefined))?.isFile()) {
    throw new Error(`拒绝覆盖已有文件：${input.output_path}`)
  }
  const warnings: string[] = []
  const palette = await loadPalette(input.output_path, input.palette)
  const body = render(input.visual_type, record(input.data, "data"), width, height, palette, warnings)
  const title = input.title ? text(input.title, 32, warnings) : ""
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" rx="24" fill="${palette.background}"/>`,
    `<style>text{font-family:"Microsoft YaHei","PingFang SC","Source Han Sans SC",sans-serif;fill:${palette.text}}.muted{fill:${palette.muted}}.label{font-size:22px}.small{font-size:17px}.title{font-size:32px;font-weight:700}</style>`,
    title ? `<text class="title" x="48" y="58">${escapeXml(title)}</text>` : "",
    `<g transform="translate(0 ${title ? 36 : 0})">${body}</g>`,
    "</svg>",
  ].join("")
  assertSafeSvg(svg)
  await mkdir(path.dirname(input.output_path), { recursive: true })
  await writeFile(input.output_path, svg, { encoding: "utf8", flag: "wx" })
  return {
    path: input.output_path,
    visual_type: input.visual_type,
    render_mode: "deterministic" as const,
    width,
    height,
    bytes: Buffer.byteLength(svg),
    warnings,
  }
}

function render(type: Exclude<VisualType, "concept">, data: Record<string, unknown>, width: number, height: number, palette: Palette, warnings: string[]) {
  if (type === "chart") return chart(data, width, height, palette, warnings)
  if (type === "timeline") return timeline(data, width, height, palette, warnings)
  if (type === "flow") return flow(data, width, height, palette, warnings)
  if (type === "grid") return grid(data, width, height, palette, warnings)
  return compare(data, width, height, palette, warnings)
}

function chart(data: Record<string, unknown>, width: number, height: number, palette: Palette, warnings: string[]) {
  const kind = string(data.kind ?? "bar", "data.kind")
  if (!["bar", "line", "pie", "ring", "radar"].includes(kind)) throw new Error(`不支持的 chart kind：${kind}`)
  const categories = strings(data.categories, "data.categories")
  const series = records(data.series, "data.series").map((item, index) => ({
    name: string(item.name ?? `系列${index + 1}`, `data.series[${index}].name`),
    values: numbers(item.values, `data.series[${index}].values`),
  }))
  if (!series.length) throw new Error("data.series 至少需要一个系列。")
  if (series.some((item) => item.values.length !== categories.length)) throw new Error("每个系列的 values 数量必须与 categories 一致。")
  if (!categories.length) throw new Error("data.categories 不能为空。")
  if (kind === "pie" || kind === "ring") return pie(series[0], categories, width, height, palette, warnings, kind === "ring")
  if (kind === "radar") return radar(series, categories, width, height, palette, warnings)
  const left = 90
  const top = 100
  const bottom = height - 80
  const right = width - 60
  const values = series.flatMap((item) => item.values)
  const max = Math.max(...values, 1)
  const colors = [palette.primary, palette.accent, palette.secondary]
  const points = series.map((item, seriesIndex) =>
    item.values.map((value, index) => ({
      x: left + ((right - left) * (index + 0.5)) / categories.length,
      y: bottom - ((bottom - top) * value) / max,
      value,
      color: colors[seriesIndex % colors.length],
    })),
  )
  const axes = `<path d="M${left} ${top}V${bottom}H${right}" fill="none" stroke="${palette.muted}" stroke-width="2"/>`
  const labels = categories.map((value, index) => `<text class="small muted" text-anchor="middle" x="${left + ((right - left) * (index + 0.5)) / categories.length}" y="${bottom + 30}">${escapeXml(text(value, 12, warnings))}</text>`).join("")
  if (kind === "line") {
    const lines = points.map((items) => `<polyline points="${items.map((item) => `${item.x},${item.y}`).join(" ")}" fill="none" stroke="${items[0].color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>${items.map((item) => `<circle cx="${item.x}" cy="${item.y}" r="7" fill="${item.color}"/><text class="small" text-anchor="middle" x="${item.x}" y="${item.y - 14}">${item.value}</text>`).join("")}`).join("")
    return axes + labels + lines
  }
  const groupWidth = (right - left) / categories.length
  const barWidth = Math.max(10, (groupWidth * 0.68) / series.length)
  const bars = points.flatMap((items, seriesIndex) => items.map((item, index) => {
    const x = left + groupWidth * index + groupWidth * 0.16 + barWidth * seriesIndex
    return `<rect x="${x}" y="${item.y}" width="${barWidth - 3}" height="${bottom - item.y}" rx="6" fill="${item.color}"/><text class="small" text-anchor="middle" x="${x + (barWidth - 3) / 2}" y="${item.y - 10}">${item.value}</text>`
  })).join("")
  return axes + labels + bars
}

function pie(series: { values: number[] }, categories: string[], width: number, height: number, palette: Palette, warnings: string[], ring: boolean) {
  const total = series.values.reduce((sum, value) => sum + Math.max(value, 0), 0)
  if (total <= 0) throw new Error("饼图数据合计必须大于 0。")
  const cx = width * 0.38
  const cy = height * 0.53
  const radius = Math.min(width, height) * 0.27
  const colors = [palette.primary, palette.accent, palette.secondary, palette.muted]
  let angle = -Math.PI / 2
  const slices = series.values.map((value, index) => {
    const next = angle + (Math.max(value, 0) / total) * Math.PI * 2
    const large = next - angle > Math.PI ? 1 : 0
    const start = [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]
    const end = [cx + radius * Math.cos(next), cy + radius * Math.sin(next)]
    const d = `M${cx} ${cy}L${start[0]} ${start[1]}A${radius} ${radius} 0 ${large} 1 ${end[0]} ${end[1]}Z`
    angle = next
    return `<path d="${d}" fill="${colors[index % colors.length]}"/>`
  }).join("")
  const hole = ring ? `<circle cx="${cx}" cy="${cy}" r="${radius * 0.55}" fill="${palette.background}"/><text class="title" text-anchor="middle" x="${cx}" y="${cy + 10}">${total}</text>` : ""
  const legend = categories.map((value, index) => `<rect x="${width * 0.72}" y="${130 + index * 54}" width="22" height="22" rx="5" fill="${colors[index % colors.length]}"/><text class="label" x="${width * 0.72 + 36}" y="${148 + index * 54}">${escapeXml(text(value, 18, warnings))} ${series.values[index]}</text>`).join("")
  return slices + hole + legend
}

function radar(series: Array<{ name: string; values: number[] }>, categories: string[], width: number, height: number, palette: Palette, warnings: string[]) {
  if (categories.length < 3) throw new Error("雷达图至少需要三个维度。")
  const cx = width / 2
  const cy = height / 2 + 25
  const radius = Math.min(width, height) * 0.28
  const max = Math.max(...series.flatMap((item) => item.values), 1)
  const point = (index: number, factor: number) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / categories.length
    return [cx + radius * factor * Math.cos(angle), cy + radius * factor * Math.sin(angle)]
  }
  const rings = [0.25, 0.5, 0.75, 1].map((factor) => `<polygon points="${categories.map((_, index) => point(index, factor).join(",")).join(" ")}" fill="none" stroke="${palette.muted}" stroke-width="1"/>`).join("")
  const axes = categories.map((value, index) => { const end = point(index, 1); const label = point(index, 1.18); return `<line x1="${cx}" y1="${cy}" x2="${end[0]}" y2="${end[1]}" stroke="${palette.muted}"/><text class="small" text-anchor="middle" x="${label[0]}" y="${label[1]}">${escapeXml(text(value, 10, warnings))}</text>` }).join("")
  const colors = [palette.primary, palette.accent, palette.secondary]
  const shapes = series.map((item, seriesIndex) => `<polygon points="${item.values.map((value, index) => point(index, value / max).join(",")).join(" ")}" fill="${colors[seriesIndex % colors.length]}" fill-opacity="0.16" stroke="${colors[seriesIndex % colors.length]}" stroke-width="4"/>`).join("")
  return rings + axes + shapes
}

function timeline(data: Record<string, unknown>, width: number, height: number, palette: Palette, warnings: string[]) {
  const items = records(data.items, "data.items")
  if (!items.length) throw new Error("data.items 不能为空。")
  const left = 90
  const right = width - 90
  const y = height / 2
  return `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${palette.primary}" stroke-width="6"/>` + items.map((item, index) => {
    const x = items.length === 1 ? width / 2 : left + ((right - left) * index) / (items.length - 1)
    const above = index % 2 === 0
    const labelY = y + (above ? -72 : 92)
    return `<circle cx="${x}" cy="${y}" r="14" fill="${palette.accent}" stroke="${palette.background}" stroke-width="5"/><text class="label" text-anchor="middle" x="${x}" y="${labelY}">${escapeXml(text(string(item.label, "item.label"), 12, warnings))}</text><text class="small muted" text-anchor="middle" x="${x}" y="${labelY + 28}">${escapeXml(text(String(item.at ?? item.desc ?? ""), 20, warnings))}</text>`
  }).join("")
}

function flow(data: Record<string, unknown>, width: number, height: number, palette: Palette, warnings: string[]) {
  const steps = records(data.steps, "data.steps")
  if (!steps.length) throw new Error("data.steps 不能为空。")
  const vertical = data.direction === "v"
  const colors = [palette.primary, palette.secondary, palette.accent]
  return steps.map((step, index) => {
    const boxWidth = vertical ? Math.min(520, width - 160) : Math.min(220, (width - 100) / steps.length - 24)
    const boxHeight = 112
    const x = vertical ? (width - boxWidth) / 2 : 50 + index * ((width - 100) / steps.length) + 12
    const y = vertical ? 82 + index * ((height - 120) / steps.length) : height / 2 - 45
    const nextX = vertical ? width / 2 : x + boxWidth + 22
    const nextY = vertical ? y + boxHeight + 18 : y + boxHeight / 2
    const arrow = index === steps.length - 1 ? "" : vertical ? `<path d="M${nextX} ${y + boxHeight}v28" stroke="${palette.muted}" stroke-width="4"/><path d="M${nextX - 8} ${nextY + 10}l8 10 8-10" fill="none" stroke="${palette.muted}" stroke-width="4"/>` : `<path d="M${x + boxWidth} ${nextY}h28" stroke="${palette.muted}" stroke-width="4"/><path d="M${nextX + 8} ${nextY - 8}l10 8-10 8" fill="none" stroke="${palette.muted}" stroke-width="4"/>`
    return `<rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="18" fill="${colors[index % colors.length]}" fill-opacity="0.12" stroke="${colors[index % colors.length]}" stroke-width="3"/><text class="label" text-anchor="middle" x="${x + boxWidth / 2}" y="${y + 44}">${escapeXml(text(string(step.label, "step.label"), 10, warnings))}</text><text class="small muted" text-anchor="middle" x="${x + boxWidth / 2}" y="${y + 76}">${escapeXml(text(String(step.desc ?? ""), 22, warnings))}</text>${arrow}`
  }).join("")
}

function grid(data: Record<string, unknown>, width: number, height: number, palette: Palette, warnings: string[]) {
  const cards = records(data.cards, "data.cards")
  if (!cards.length) throw new Error("data.cards 不能为空。")
  const cols = integer(typeof data.cols === "number" ? data.cols : 2, "data.cols", 1, 5)
  const rows = Math.ceil(cards.length / cols)
  const gap = 24
  const cardWidth = (width - 96 - gap * (cols - 1)) / cols
  const cardHeight = (height - 120 - gap * (rows - 1)) / rows
  return cards.map((card, index) => {
    const x = 48 + (index % cols) * (cardWidth + gap)
    const y = 84 + Math.floor(index / cols) * (cardHeight + gap)
    return `<rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="20" fill="${palette.primary}" fill-opacity="0.08" stroke="${palette.primary}" stroke-opacity="0.35"/><text class="label" x="${x + 24}" y="${y + 42}">${escapeXml(text(string(card.title, "card.title"), 10, warnings))}</text><text class="small muted" x="${x + 24}" y="${y + 76}">${escapeXml(text(String(card.desc ?? ""), 25, warnings))}</text>`
  }).join("")
}

function compare(data: Record<string, unknown>, width: number, height: number, palette: Palette, warnings: string[]) {
  const left = record(data.left, "data.left")
  const right = record(data.right, "data.right")
  const panel = (side: Record<string, unknown>, x: number, color: string) => {
    const items = strings(side.items, "compare.items")
    return `<rect x="${x}" y="100" width="${width * 0.42}" height="${height - 150}" rx="24" fill="${color}" fill-opacity="0.08" stroke="${color}" stroke-width="3"/><text class="title" x="${x + 32}" y="154">${escapeXml(text(string(side.title, "compare.title"), 12, warnings))}</text>${items.map((item, index) => `<circle cx="${x + 42}" cy="${205 + index * 58}" r="7" fill="${color}"/><text class="label" x="${x + 64}" y="${212 + index * 58}">${escapeXml(text(item, 25, warnings))}</text>`).join("")}`
  }
  return panel(left, width * 0.06, palette.primary) + panel(right, width * 0.52, palette.accent)
}

async function loadPalette(outputPath: string, input: unknown): Promise<Palette> {
  const direct = palette(input)
  if (direct) return direct
  let directory = path.dirname(outputPath)
  while (path.dirname(directory) !== directory) {
    const candidate = path.join(directory, "docs", "page-global-config.json")
    const content = await readFile(candidate, "utf8").catch(() => undefined)
    if (content) {
      const parsed = JSON.parse(content) as unknown
      const found = palette(parsed)
      if (found) return found
    }
    directory = path.dirname(directory)
  }
  return { primary: "#2563EB", secondary: "#0F766E", accent: "#F59E0B", background: "#F8FAFC", text: "#0F172A", muted: "#64748B" }
}

function palette(value: unknown): Palette | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return
  const source = value as Record<string, unknown>
  const get = (...keys: string[]) => keys.map((key) => source[key]).find((item): item is string => typeof item === "string" && /^#[0-9a-f]{6}$/i.test(item))
  const primary = get("primary", "primaryColor", "mainColor")
  if (!primary) return
  return {
    primary,
    secondary: get("secondary", "secondaryColor") ?? "#0F766E",
    accent: get("accent", "accentColor") ?? "#F59E0B",
    background: get("background", "backgroundColor") ?? "#F8FAFC",
    text: get("text", "textColor") ?? "#0F172A",
    muted: get("muted", "mutedColor") ?? "#64748B",
  }
}

function assertSafeSvg(svg: string) {
  if (!svg.startsWith("<svg") || !svg.endsWith("</svg>")) throw new Error("生成内容不是完整 SVG。")
  if (/<(?:linear|radial)Gradient|gradient\(|<script|(?:href|src)=["']https?:/i.test(svg)) throw new Error("SVG 含渐变、脚本或外链资源。")
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} 必须是对象。`)
  return value as Record<string, unknown>
}

function records(value: unknown, name: string) {
  if (!Array.isArray(value)) throw new Error(`${name} 必须是数组。`)
  return value.map((item, index) => record(item, `${name}[${index}]`))
}

function strings(value: unknown, name: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`${name} 必须是字符串数组。`)
  return value as string[]
}

function numbers(value: unknown, name: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "number" || !Number.isFinite(item))) throw new Error(`${name} 必须是有限数值数组。`)
  return value as number[]
}

function string(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} 必须是非空字符串。`)
  return value
}

function integer(value: number, name: string, min: number, max: number) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} 必须是 ${min}-${max} 的整数。`)
  return value
}

function text(value: string, limit: number, warnings: string[]) {
  if (value.length <= limit) return value
  warnings.push(`文本已截断：${value.slice(0, 18)}…`)
  return `${value.slice(0, Math.max(1, limit - 1))}…`
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;")
}
