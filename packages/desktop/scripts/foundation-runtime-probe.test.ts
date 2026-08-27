import { expect, test } from "bun:test"

import { probeOfficeNetworkRuntime } from "./office-network-runtime"

test("Foundation runtimes execute minimum tasks in an isolated office-network environment", async () => {
  expect(await probeOfficeNetworkRuntime()).toEqual(
    expect.objectContaining({
      pdfkit: true,
      skillGovernance: true,
      userSiteIsolated: true,
      globalDotnetUsed: false,
      nugetUsed: false,
      networkUsed: false,
    }),
  )
}, 60_000)
