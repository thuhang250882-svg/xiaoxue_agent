import { InstanceRef, WorkspaceRef } from "@/effect/instance-ref"
import { InstanceStore } from "@/project/instance-store"
import { Effect, Layer } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiMiddleware } from "effect/unstable/httpapi"
import { WorkspaceRouteContext } from "./workspace-routing"

export class InstanceContextMiddleware extends HttpApiMiddleware.Service<
  InstanceContextMiddleware,
  {
    requires: WorkspaceRouteContext
  }
>()("@opencode/ExperimentalHttpApiInstanceContext") {}

function decode(input: string): string {
  try {
    return decodeURIComponent(input)
  } catch {
    return input
  }
}

function provideInstanceContext<E>(
  effect: Effect.Effect<HttpServerResponse.HttpServerResponse, E>,
  store: InstanceStore.Interface,
): Effect.Effect<HttpServerResponse.HttpServerResponse, E, WorkspaceRouteContext> {
  return Effect.gen(function* () {
    const route = yield* WorkspaceRouteContext
    const input = { directory: decode(route.directory) }
    // Fail fast with 503 while another request is still creating the instance,
    // instead of parking on the shared bootstrap deferred until the client
    // disconnects — the disconnect is what the office logs record as 499 noise.
    // The raw empty response follows the same pattern as the 401 branch in
    // authorization.ts: it bypasses the API error schemas, so clients see a
    // plain 503 (SDK: error.cause.status) rather than a decode failure.
    // Only concurrent bootstraps fail fast; the first request for a directory
    // keeps the blocking path because something has to create the instance.
    if (store.status(input) === "booting") {
      return HttpServerResponse.empty({
        status: 503,
        headers: { "retry-after": "1" },
      })
    }
    const ctx = yield* store.load(input)
    return yield* effect.pipe(
      Effect.provideService(InstanceRef, ctx),
      Effect.provideService(WorkspaceRef, route.workspaceID),
    )
  })
}

export const instanceContextLayer = Layer.effect(
  InstanceContextMiddleware,
  Effect.gen(function* () {
    const store = yield* InstanceStore.Service
    return InstanceContextMiddleware.of((effect) => provideInstanceContext(effect, store))
  }),
)
