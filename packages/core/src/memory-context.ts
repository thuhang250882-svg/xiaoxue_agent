export * as MemoryContext from "./memory-context"

import { Context, Effect, Layer } from "effect"
import { makeLocationNode } from "./effect/app-node"

export interface RecallInput {
  readonly sessionID: string
  readonly query?: string
  readonly review?: boolean
  readonly userTurns?: number
}

export type Target = "memory" | "user"
export type Action = "list" | "add" | "replace" | "remove"

export interface ManageInput {
  readonly action: Action
  readonly target?: Target
  readonly content?: string
  readonly match?: string
}

export interface ManageResult {
  readonly success: boolean
  readonly message: string
  readonly id?: string
  readonly entries?: ReadonlyArray<string>
  readonly store?: {
    readonly user: ReadonlyArray<string>
    readonly shared: ReadonlyArray<string>
    readonly project: ReadonlyArray<string>
  }
}

export interface Interface {
  readonly recall: (input: RecallInput) => Effect.Effect<string>
  readonly manage: (input: ManageInput) => Effect.Effect<ManageResult>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/MemoryContext") {}

export const layerWith = (value: Interface) => Layer.succeed(Service, Service.of(value))

const layer = layerWith({
  recall: () => Effect.succeed(""),
  manage: () => Effect.succeed({ success: false, message: "长期记忆服务未启用。" }),
})

export const node = makeLocationNode({ service: Service, layer, deps: [] })

