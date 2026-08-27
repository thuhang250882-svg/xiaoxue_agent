import { expect, test } from "bun:test"
import path from "node:path"

const rootDir = path.resolve(import.meta.dirname, "../../..")

test("office-network capability matrix covers every Foundation and unavailable runtime", async () => {
  const profile = await Bun.file(path.join(rootDir, "configs", "xiaoxue", "rc-release-profile.json")).json()
  const matrix = await Bun.file(path.join(rootDir, "docs", "office-network-capability-matrix.md")).text()
  for (const skill of profile.rc.FOUNDATIONS) {
    expect(matrix).toContain(`\`${skill}\``)
    expect(matrix).toContain("FOUNDATION")
  }
  for (const skill of profile.OFFICE_NETWORK_UNAVAILABLE) {
    expect(matrix).toContain(`\`${skill}\``)
    expect(matrix).toContain("UNAVAILABLE")
  }
})
