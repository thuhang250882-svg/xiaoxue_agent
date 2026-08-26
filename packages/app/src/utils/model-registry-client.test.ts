import { afterEach, describe, expect, test } from "bun:test"
import { createServer, type Server } from "node:http"
import { createModelRegistryClient } from "./model-registry-client"

const servers: Server[] = []

afterEach(() => {
  servers.splice(0).forEach((server) => server.close())
})

async function api() {
  const requests: Array<{ path?: string; body?: unknown }> = []
  const server = createServer((request, response) => {
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,PATCH",
        "access-control-allow-headers": "content-type",
      })
      response.end()
      return
    }
    let body = ""
    request.on("data", (chunk) => (body += chunk))
    request.on("end", () => {
      requests.push({ path: request.url, body: body ? JSON.parse(body) : undefined })
      response.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" })
      response.end(
        request.url?.endsWith("/test")
          ? '{"ok":true,"result":{"ok":true,"latencyMs":1}}'
          : '{"ok":true,"models":[]}',
      )
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("test server did not bind")
  return { client: createModelRegistryClient(`http://127.0.0.1:${address.port}`), requests }
}

describe("model registry client", () => {
  test("keeps connection-test endpoint and credentials server-owned", async () => {
    const server = await api()
    expect(await server.client.test("mdl_test")).toEqual({ ok: true, latencyMs: 1 })
    expect(server.requests).toEqual([{ path: "/global/models/mdl_test/test", body: {} }])
  })

  test("creates a provider's models in one batch request", async () => {
    const server = await api()
    await server.client.createMany([
      { providerId: "local-llm", modelId: "model-a" },
      { providerId: "local-llm", modelId: "model-b" },
    ])
    expect(server.requests).toEqual([
      {
        path: "/global/models",
        body: {
          models: [
            { providerId: "local-llm", modelId: "model-a" },
            { providerId: "local-llm", modelId: "model-b" },
          ],
        },
      },
    ])
  })
})

