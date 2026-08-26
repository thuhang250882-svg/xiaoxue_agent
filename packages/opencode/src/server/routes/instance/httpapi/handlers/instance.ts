import { Agent } from "@/agent/agent"
import { Command } from "@/command"
import * as InstanceState from "@/effect/instance-state"
import { Format } from "@/format"
import { Global } from "@opencode-ai/core/global"
import { LSP } from "@/lsp/lsp"
import { Vcs } from "@/project/vcs"
import { Skill } from "@/skill"
import { Effect, Schema } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import {
  ApiSkillConflictError,
  ApiSkillFilesystemError,
  ApiSkillInvalidNameError,
  ApiSkillNotFoundError,
  ApiSkillReadOnlyError,
  ApiSkillValidationError,
  ApiVcsApplyError,
} from "../groups/instance"
import { markInstanceForDisposal } from "../lifecycle"

function mapSkillError(error: unknown) {
  if (Schema.is(Skill.InvalidNameError)(error)) {
    return new ApiSkillInvalidNameError({ code: "SKILL_INVALID_NAME", message: error.message, details: { name: error.name } })
  }
  if (Schema.is(Skill.ReadOnlyError)(error)) {
    return new ApiSkillReadOnlyError({
      code: "SKILL_READ_ONLY",
      message: error.message,
      details: { name: error.name, source: error.source },
    })
  }
  if (Schema.is(Skill.NotFoundError)(error)) {
    return new ApiSkillNotFoundError({
      code: "SKILL_NOT_FOUND",
      message: error.message,
      details: { name: error.name, available: error.available },
    })
  }
  if (Schema.is(Skill.ConflictError)(error)) {
    return new ApiSkillConflictError({
      code: "SKILL_NAME_CONFLICT",
      message: error.message,
      details: { skill: error.skill, conflictsWith: error.conflictsWith },
    })
  }
  if (
    Schema.is(Skill.InvalidError)(error) ||
    Schema.is(Skill.NameMismatchError)(error) ||
    Schema.is(Skill.ImportError)(error)
  ) {
    return new ApiSkillValidationError({
      code: "SKILL_VALIDATION_FAILED",
      message: error instanceof Error ? error.message : String(error),
      details: {},
    })
  }
  return new ApiSkillFilesystemError({
    code: "SKILL_FILESYSTEM_ERROR",
    message: error instanceof Error ? error.message : String(error),
    details: {},
  })
}

export const instanceHandlers = HttpApiBuilder.group(InstanceHttpApi, "instance", (handlers) =>
  Effect.gen(function* () {
    const agent = yield* Agent.Service
    const command = yield* Command.Service
    const format = yield* Format.Service
    const lsp = yield* LSP.Service
    const skill = yield* Skill.Service
    const vcs = yield* Vcs.Service

    const dispose = Effect.fn("InstanceHttpApi.dispose")(function* () {
      yield* markInstanceForDisposal(yield* InstanceState.context)
      return true
    })

    const getPath = Effect.fn("InstanceHttpApi.path")(function* () {
      const ctx = yield* InstanceState.context
      return {
        home: Global.Path.home,
        tmp: Global.Path.tmp,
        state: Global.Path.state,
        config: Global.Path.config,
        worktree: ctx.worktree,
        directory: ctx.directory,
      }
    })

    const getVcs = Effect.fn("InstanceHttpApi.vcs")(function* () {
      const [branch, default_branch] = yield* Effect.all([vcs.branch(), vcs.defaultBranch()], {
        concurrency: "unbounded",
      })
      return { branch, default_branch }
    })

    const getVcsStatus = Effect.fn("InstanceHttpApi.vcsStatus")(function* () {
      return yield* vcs.status()
    })

    const getVcsDiff = Effect.fn("InstanceHttpApi.vcsDiff")(function* (ctx: {
      query: { mode: Vcs.Mode; context?: number }
    }) {
      return yield* vcs.diff(ctx.query.mode, { context: ctx.query.context })
    })

    const getVcsDiffRaw = Effect.fn("InstanceHttpApi.vcsDiffRaw")(function* () {
      return yield* vcs.diffRaw()
    })

    const applyVcs = Effect.fn("InstanceHttpApi.vcsApply")(function* (ctx: { payload: Vcs.ApplyInput }) {
      return yield* vcs.apply(ctx.payload).pipe(
        Effect.mapError(
          (error) =>
            new ApiVcsApplyError({
              name: "VcsApplyError",
              data: {
                message: error.message,
                reason: error.reason,
              },
            }),
        ),
      )
    })

    const getCommand = Effect.fn("InstanceHttpApi.command")(function* () {
      return yield* command.list()
    })

    const getAgent = Effect.fn("InstanceHttpApi.agent")(function* () {
      return yield* agent.list()
    })

    const getSkill = Effect.fn("InstanceHttpApi.skill")(function* () {
      return yield* skill.all()
    })

    const updateSkill = Effect.fn("InstanceHttpApi.skillUpdate")(function* (ctx: {
      params: { name: string }
      payload: Skill.SkillPatch
    }) {
      const updated = yield* skill.update(ctx.params.name, ctx.payload).pipe(Effect.mapError(mapSkillError))
      return yield* skill.inspect(updated.name).pipe(Effect.mapError(mapSkillError))
    })

    const removeSkill = Effect.fn("InstanceHttpApi.skillRemove")(function* (ctx: { params: { name: string } }) {
      yield* skill.remove(ctx.params.name).pipe(Effect.mapError(mapSkillError))
      return true
    })

    const createSkill = Effect.fn("InstanceHttpApi.skillCreate")(function* (ctx: {
      payload: { name: string; description?: string; content?: string }
    }) {
      const created = yield* skill.create(ctx.payload).pipe(Effect.mapError(mapSkillError))
      return yield* skill.inspect(created.name).pipe(Effect.mapError(mapSkillError))
    })

    const importSkill = Effect.fn("InstanceHttpApi.skillImport")(function* (ctx: {
      payload: { token: string }
    }) {
      const imported = yield* skill.import(ctx.payload.token).pipe(Effect.mapError(mapSkillError))
      return yield* skill.inspect(imported.name).pipe(Effect.mapError(mapSkillError))
    })

    const previewSkillImport = Effect.fn("InstanceHttpApi.skillImportPreview")(function* (ctx: {
      payload: { source: string }
    }) {
      return yield* skill.previewImport(ctx.payload.source).pipe(Effect.mapError(mapSkillError))
    })

    const enableSkill = Effect.fn("InstanceHttpApi.skillEnable")(function* (ctx: { params: { name: string } }) {
      const enabled = yield* skill.enable(ctx.params.name).pipe(Effect.mapError(mapSkillError))
      return yield* skill.inspect(enabled.name).pipe(Effect.mapError(mapSkillError))
    })

    const disableSkill = Effect.fn("InstanceHttpApi.skillDisable")(function* (ctx: { params: { name: string } }) {
      const disabled = yield* skill.disable(ctx.params.name).pipe(Effect.mapError(mapSkillError))
      return yield* skill.inspect(disabled.name).pipe(Effect.mapError(mapSkillError))
    })

    const validateSkill = Effect.fn("InstanceHttpApi.skillValidate")(function* (ctx: { params: { name: string } }) {
      return yield* skill.validate(ctx.params.name).pipe(Effect.mapError(mapSkillError))
    })

    const getSkillHealth = Effect.fn("InstanceHttpApi.skillHealth")(function* (ctx: { params: { name: string } }) {
      return yield* skill.health(ctx.params.name).pipe(Effect.mapError(mapSkillError))
    })

    const getLsp = Effect.fn("InstanceHttpApi.lsp")(function* () {
      return yield* lsp.status()
    })

    const getFormatter = Effect.fn("InstanceHttpApi.formatter")(function* () {
      return yield* format.status()
    })

    const getSkillConflicts = Effect.fn("InstanceHttpApi.skillConflicts")(function* () {
      return yield* skill.conflicts()
    })

    return handlers
      .handle("dispose", dispose)
      .handle("path", getPath)
      .handle("vcs", getVcs)
      .handle("vcsStatus", getVcsStatus)
      .handle("vcsDiff", getVcsDiff)
      .handle("vcsDiffRaw", getVcsDiffRaw)
      .handle("vcsApply", applyVcs)
      .handle("command", getCommand)
      .handle("agent", getAgent)
      .handle("skill", getSkill)
      .handle("skillUpdate", updateSkill)
      .handle("skillRemove", removeSkill)
      .handle("skillCreate", createSkill)
      .handle("skillImport", importSkill)
      .handle("skillImportPreview", previewSkillImport)
      .handle("skillEnable", enableSkill)
      .handle("skillDisable", disableSkill)
      .handle("skillValidate", validateSkill)
      .handle("skillHealth", getSkillHealth)
      .handle("skillConflicts", getSkillConflicts)
      .handle("lsp", getLsp)
      .handle("formatter", getFormatter)
  }),
)
