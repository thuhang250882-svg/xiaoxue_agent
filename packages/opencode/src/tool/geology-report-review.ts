import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Effect, Schema } from "effect"
import { reviewUploadedAttachments } from "../../../../domains/geology_report"
import type { ReviewAttachmentInput, XiaoxueRuntimeStateEvent } from "../../../../domains/geology_report"
import { Session } from "../session/session"
import { XiaoxueTrustedAttachments } from "../xiaoxue/trusted-attachments"
import { upsertBusinessTask, type BusinessTask } from "./business-task"
import { exportPersistedGeologyReview } from "./geology-review-export"
import { Tool } from "./tool"

const Parameters = Schema.Struct({
  filenames: Schema.optional(Schema.Array(Schema.String)),
  primaryReport: Schema.optional(Schema.String),
})

export const GeologyReportReviewTool = Tool.define(
  "geology_report_review",
  Effect.gen(function* () {
    const sessions = yield* Session.Service

    return {
      description:
        "审核当前会话中用户上传的地质录井 DOC/DOCX/XLS/XLSX/PDF/TXT/CSV 文件。用户要求审核报告或附表时必须调用，返回结构化 ReviewResult。",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) => {
        const taskId = `review-${Date.now()}`
        const createdAt = new Date().toISOString()
        const attachments = latestUserAttachments(ctx.messages)
        const persist = (task: BusinessTask) =>
          Effect.gen(function* () {
            const current = yield* sessions.get(ctx.sessionID)
            yield* sessions.setMetadata({
              sessionID: ctx.sessionID,
              metadata: upsertBusinessTask(current.metadata, task),
            })
          })
        const base: BusinessTask = {
          id: taskId,
          sessionId: ctx.sessionID,
          taskType: "geology_report_review",
          agent: ctx.agent,
          title: params.primaryReport ?? attachments[0]?.filename ?? "地质录井报告审核",
          status: "running",
          createdAt,
          sourceFiles: attachments.map((item) => ({
            fileName: item.filename ?? "unnamed-file",
            mime: item.mime,
            sourcePath: item.sourcePath,
          })),
          exportedFiles: [],
        }

        return Effect.gen(function* () {
          yield* persist(base)
          const envelope = yield* Effect.tryPromise({
            try: () =>
              reviewUploadedAttachments({
                sessionId: ctx.sessionID,
                taskId,
                attachments,
                filenames: params.filenames ? [...params.filenames] : undefined,
                primaryReport: params.primaryReport,
                // 审核读取必须经过可信附件登记表：凭证消费 + 未登记路径拒绝
                trustedAttachments: {
                  consumeUrl: (url) => XiaoxueTrustedAttachments.consumeUrl(url),
                  consumeByPath: (path) => XiaoxueTrustedAttachments.consumeByPath(path),
                },
                onState: (event) => Effect.runPromise(ctx.metadata({ title: "地质录井报告审核", metadata: event })),
              }),
            catch: (error) => (error instanceof Error ? error : new Error(String(error))),
          })
          const exported = yield* Effect.tryPromise({
            try: () => exportPersistedGeologyReview(envelope.result),
            catch: (error) => (error instanceof Error ? error : new Error(String(error))),
          })
          yield* persist({
            ...base,
            sourceFiles: mergeResolvedSources(base.sourceFiles, envelope.resolvedSources),
            title: envelope.result.fileName,
            status: "completed",
            completedAt: new Date().toISOString(),
            wellName: extractWellName(envelope.result.fileName),
            resultType: "review_result",
            result: envelope.result,
            score: envelope.result.summary,
            exportedFiles: [{
              fileName: exported.fileName,
              filePath: exported.filePath,
              format: exported.format,
              size: exported.size,
            }],
          })
          return {
            title: "地质录井报告审核",
            output: JSON.stringify(envelope),
            metadata: {
              type: "xiaoxue.agent.state" as const,
              taskId,
              sessionId: ctx.sessionID,
              state: "success" as const,
              message: `审核完成，共发现 ${envelope.result.summary.totalIssues} 项问题。`,
              reviewResult: envelope.result,
            },
          }
        }).pipe(
          Effect.catch((error) => {
            const failure = error instanceof Error ? error : new Error(String(error))
            const metadata: XiaoxueRuntimeStateEvent = {
              type: "xiaoxue.agent.state",
              taskId,
              sessionId: ctx.sessionID,
              state: "error",
              message: failure.message,
            }
            return persist({
              ...base,
              status: "failed",
              completedAt: new Date().toISOString(),
              error: { message: failure.message },
            }).pipe(
              Effect.andThen(ctx.metadata({ title: "地质录井报告审核失败", metadata })),
              Effect.map(() => ({
                title: "地质录井报告审核失败",
                output: JSON.stringify({ type: "geology_report_review_error", taskId, error: failure.message }),
                metadata,
              })),
            )
          }),
        ).pipe(Effect.orDie)
      },
    }
  }),
)

function latestUserAttachments(messages: SessionV1.WithParts[]) {
  const message = [...messages].reverse().find((item) => item.info.role === "user")
  if (!message) return []

  return message.parts
    .filter((part): part is SessionV1.FilePart => part.type === "file")
    .map(
      (part): ReviewAttachmentInput => ({
        filename: part.filename,
        mime: part.mime,
        url: part.url,
        sourcePath: part.source?.type === "file" ? part.source.path : undefined,
      }),
    )
}

function extractWellName(fileName: string) {
  return fileName.match(/([\u4e00-\u9fffA-Za-z0-9-]{1,24}\u4e95)/)?.[1]
}

// 审核过程中读取到的真实大小与 SHA-256 回填到业务历史，供重新授权时比对
function mergeResolvedSources(
  sources: BusinessTask["sourceFiles"],
  resolved?: Array<{ fileName: string; size: number; sha256: string }>,
): BusinessTask["sourceFiles"] {
  if (!resolved?.length) return sources
  return sources.map((source) => {
    const match = resolved.find((item) => item.fileName === source.fileName)
    if (!match) return source
    return { ...source, size: match.size, sha256: match.sha256 }
  })
}
