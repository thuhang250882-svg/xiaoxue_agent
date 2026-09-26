import { createHash } from "node:crypto"
import { extractRawText } from "mammoth"
import type { StrategyDraft } from "./review-strategy"

export async function verifyRevisionEvidence(input: {
  draft: Pick<StrategyDraft, "before" | "after" | "sourceFile"> & { sourceHash?: string }
  original: { name: string; data: Uint8Array }
  revised: { name: string; data: Uint8Array }
}) {
  if (input.original.name !== input.draft.sourceFile) throw new Error("原稿文件名与策略来源不一致。")
  if (!input.original.name.toLowerCase().endsWith(".docx") || !input.revised.name.toLowerCase().endsWith(".docx"))
    throw new Error("策略来源核验目前只支持原稿和人工定稿均为 DOCX。")
  const sourceHash = createHash("sha256").update(input.original.data).digest("hex")
  const revisedHash = createHash("sha256").update(input.revised.data).digest("hex")
  if (sourceHash === revisedHash) throw new Error("原稿和定稿内容相同，无法证明存在人工修改。")
  if (input.draft.sourceHash && input.draft.sourceHash.toLowerCase() !== sourceHash)
    throw new Error("原稿 SHA-256 与候选策略不一致。")
  if (!isZip(input.original.data) || !isZip(input.revised.data)) throw new Error("策略来源不是有效 DOCX 二进制文件。")
  // Only text is needed for evidence matching; HTML conversion would inline large report images.
  const [original, revised] = await Promise.all([
    extractRawText({ buffer: Buffer.from(input.original.data) }),
    extractRawText({ buffer: Buffer.from(input.revised.data) }),
  ])
  const before = normalize(input.draft.before)
  const after = normalize(input.draft.after)
  if (!before || !after || before === after) throw new Error("前后片段必须不同且非空。")
  if (count(normalize(original.value), before) !== 1) throw new Error("原稿修改前片段必须恰好出现一次。")
  if (count(normalize(revised.value), after) !== 1) throw new Error("定稿修改后片段必须恰好出现一次。")
  if (count(normalize(original.value), after) || count(normalize(revised.value), before))
    throw new Error("前后片段未形成明确替换：原稿已含定稿片段或定稿仍含原稿片段。")
  const originalText = normalize(original.value)
  const revisedText = normalize(revised.value)
  return {
    sourceHash,
    revisedHash,
    revisedFile: input.revised.name,
    evidenceStatus: matchingContext(originalText, revisedText, before, after)
      ? ("verified" as const)
      : ("needs-location-review" as const),
  }
}

function matchingContext(original: string, revised: string, before: string, after: string) {
  const originalIndex = original.indexOf(before)
  const revisedIndex = revised.indexOf(after)
  const prefixLength = Math.min(24, originalIndex, revisedIndex)
  const suffixLength = Math.min(
    24,
    original.length - originalIndex - before.length,
    revised.length - revisedIndex - after.length,
  )
  const prefixMatches =
    prefixLength < 8 ||
    original.slice(originalIndex - prefixLength, originalIndex) ===
      revised.slice(revisedIndex - prefixLength, revisedIndex)
  const suffixMatches =
    suffixLength < 8 ||
    original.slice(originalIndex + before.length, originalIndex + before.length + suffixLength) ===
      revised.slice(revisedIndex + after.length, revisedIndex + after.length + suffixLength)
  return (prefixLength >= 8 || suffixLength >= 8) && prefixMatches && suffixMatches
}

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function count(text: string, fragment: string) {
  return text.split(fragment).length - 1
}

function isZip(data: Uint8Array) {
  return data.length > 4 && data[0] === 0x50 && data[1] === 0x4b
}
