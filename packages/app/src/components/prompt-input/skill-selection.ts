import type { Prompt } from "@/context/prompt"

export function promptWithSelectedSkill(current: Prompt, name: string): Prompt {
  const first = current[0]
  const prefix = `/${name} `
  const stripped = first?.type === "text" ? first.content.replace(/^\/[\w-]+\s*/, "") : undefined
  const removed = first?.type === "text" ? first.content.length - stripped!.length : 0
  const delta = prefix.length - removed
  return [
    { type: "text", content: prefix, start: 0, end: prefix.length },
    ...current.map((part, index) => {
      if (part.type === "image") return part
      return {
        ...part,
        content: index === 0 && stripped !== undefined ? stripped : part.content,
        start: index === 0 && stripped !== undefined ? prefix.length : part.start + delta,
        end: part.end + delta,
      }
    }),
  ]
}
