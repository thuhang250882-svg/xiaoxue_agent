import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const output = await mkdtemp(path.join(os.tmpdir(), "xiaoxue-node-gate-build-"))
try {
  const result = await Bun.build({
    entrypoints: [path.join(import.meta.dir, "node-runtime-gate-entry.ts")],
    outdir: output,
    target: "node",
    format: "esm",
    conditions: ["node"],
    plugins: [
      {
        name: "node-runtime-gate-boundaries",
        setup(build) {
          const modules = new Map([
            [
              "effect",
              `
                export const Effect = { succeed: (value) => value }
                export const Schema = {
                  Literals: (value) => value,
                  Struct: (value) => value,
                  optional: (value) => value,
                  Array: (value) => value,
                  String: "string",
                  Number: "number",
                }
              `,
            ],
            ["@opencode-ai/core/global", `export const Global = { Path: { data: "" } }`],
            ["./tool", `export const Tool = { define: (_name, value) => value }`],
            [
              "./xiaoxue-attachments",
              `
                export const latestUserAttachments = () => []
                export async function readAttachment(attachment) {
                  const response = await fetch(attachment.url)
                  return new Uint8Array(await response.arrayBuffer())
                }
              `,
            ],
            [
              "document_engine",
              `
                export async function parseDocument(input) {
                  const rawText = new TextDecoder().decode(input.data)
                  return {
                    fileId: input.fileName,
                    fileName: input.fileName,
                    fileType: input.fileName.split(".").at(-1) ?? "txt",
                    rawText,
                    paragraphs: rawText ? [{ index: 1, text: rawText, location: "正文第 1 段" }] : [],
                    tables: [],
                    metadata: input.metadata ?? {},
                  }
                }
              `,
            ],
          ])
          build.onResolve({ filter: /^effect$/ }, () => ({ path: "effect", namespace: "node-gate" }))
          build.onResolve({ filter: /^@opencode-ai\/core\/global$/ }, () => ({
            path: "@opencode-ai/core/global",
            namespace: "node-gate",
          }))
          build.onResolve({ filter: /^\.\/tool$/ }, () => ({ path: "./tool", namespace: "node-gate" }))
          build.onResolve({ filter: /^\.\/xiaoxue-attachments$/ }, () => ({
            path: "./xiaoxue-attachments",
            namespace: "node-gate",
          }))
          build.onResolve({ filter: /document_engine$/ }, () => ({ path: "document_engine", namespace: "node-gate" }))
          build.onLoad({ filter: /.*/, namespace: "node-gate" }, (args) => ({
            contents: modules.get(args.path) ?? "",
            loader: "ts",
          }))
        },
      },
    ],
  })
  if (!result.success) throw new AggregateError(result.logs, "Node runtime gate bundle failed")
  const entry = result.outputs.find((item) => item.kind === "entry-point")
  if (!entry) throw new Error("Node runtime gate entry output was not generated")
  const node = Bun.which("node")
  if (!node) throw new Error("node.exe was not found")
  const child = Bun.spawn([node, entry.path], {
    env: { ...process.env, XIAOXUE_NODE_GATE_PACKAGE_ROOT: path.resolve(import.meta.dir, "../..") },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exit, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (stdout.trim()) console.log(stdout.trim())
  if (exit) throw new Error([`Node runtime gate failed with exit ${exit}.`, stderr.trim()].filter(Boolean).join("\n"))
} finally {
  await rm(output, { recursive: true, force: true })
}
