import type { Part } from "@opencode-ai/sdk/v2"
import type { OfficeArtifactResultData } from "./OfficeArtifactPreview"

const formats = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx", "pdf", "mdb", "md"])

// Scripts the agent runs via bash (e.g. python-docx fallbacks for text-box
// content) emit file paths as plain stdout text instead of the structured
// office-tool JSON, so scan those outputs for absolute artifact paths.
const extensionPattern = "docx|xlsx|pptx|pdf|mdb|doc|xls|ppt|md"
const unquotedPathPattern = new RegExp(`\\b[A-Za-z]:[\\\\/][^\\s"'\`<>|]*?\\.(?:${extensionPattern})(?![\\w.])`, "gi")
const quotedPathPattern = new RegExp(`"([A-Za-z]:[\\\\/][^"]*?\\.(?:${extensionPattern}))"`, "gi")

export function collectSessionArtifacts(parts: Part[]): OfficeArtifactResultData[] {
  const found = new Map<string, OfficeArtifactResultData>()
  parts.forEach((part) => {
    if (part.type !== "tool" || part.state.status !== "completed") return
    const result = parseResult(part.state.output)
    if (!result) {
      if (part.tool !== "bash") return
      collectScriptedPaths(part.state.output).forEach((filePath) => found.set(filePath, scriptedArtifact(filePath)))
      return
    }
    const candidates = [
      result.type === "office_artifact_result" ? result : undefined,
      result.exportedFile,
      ...(Array.isArray(result.exportedFiles) ? result.exportedFiles : []),
      result.annotated,
      result.final,
    ]
    candidates.forEach((candidate) => {
      const artifact = normalizeArtifact(candidate)
      if (!artifact) return
      const previous = found.get(artifact.filePath)
      if (previous && previous.paragraphs.length + previous.tables.length > artifact.paragraphs.length + artifact.tables.length) return
      found.set(artifact.filePath, artifact)
    })
  })
  return [...found.values()]
}

function collectScriptedPaths(output: string): string[] {
  const paths = new Set<string>()
  for (const match of output.matchAll(quotedPathPattern)) paths.add(match[1])
  for (const match of output.matchAll(unquotedPathPattern)) paths.add(match[0])
  return [...paths].filter((filePath) => {
    const extension = filePath.match(/\.([a-z]+)$/i)?.[1]?.toLowerCase()
    return extension && formats.has(extension)
  })
}

function scriptedArtifact(filePath: string): OfficeArtifactResultData {
  return {
    type: "office_artifact_result",
    filePath,
    fileName: filePath.split(/[\\/]/).at(-1) ?? filePath,
    fileType: (filePath.match(/\.([a-z]+)$/i)?.[1]?.toLowerCase() ?? "md") as OfficeArtifactResultData["fileType"],
    size: 0,
    metadata: {},
    paragraphs: [],
    tables: [],
    annotations: [],
    truncated: false,
  }
}

function parseResult(output: string): Record<string, unknown> | undefined {
  if (!output.trimStart().startsWith("{")) return
  try {
    const value: unknown = JSON.parse(output)
    return record(value)
  } catch {
    return
  }
}

function normalizeArtifact(value: unknown): OfficeArtifactResultData | undefined {
  const item = record(value)
  if (!item || typeof item.filePath !== "string" || !isAbsolute(item.filePath)) return
  const fileType = item.filePath.match(/\.(docx|xlsx|pptx|doc|xls|ppt|pdf|mdb|md)$/i)?.[1]?.toLowerCase()
  if (!fileType || !formats.has(fileType)) return
  return {
    type: "office_artifact_result",
    filePath: item.filePath,
    fileName: typeof item.fileName === "string" ? item.fileName : item.filePath.split(/[\\/]/).at(-1) ?? item.filePath,
    fileType: fileType as OfficeArtifactResultData["fileType"],
    size: typeof item.size === "number" && item.size >= 0 ? item.size : 0,
    modifiedAt: typeof item.modifiedAt === "number" ? item.modifiedAt : undefined,
    sha256: typeof item.sha256 === "string" ? item.sha256 : undefined,
    metadata: record(item.metadata) ?? {},
    paragraphs: Array.isArray(item.paragraphs) ? item.paragraphs as OfficeArtifactResultData["paragraphs"] : [],
    tables: Array.isArray(item.tables) ? item.tables as OfficeArtifactResultData["tables"] : [],
    annotations: Array.isArray(item.annotations) ? item.annotations as OfficeArtifactResultData["annotations"] : [],
    truncated: item.truncated === true,
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function isAbsolute(value: string) {
  return /^[a-z]:[\\/]/i.test(value) || value.startsWith("/") || value.startsWith("\\\\")
}
