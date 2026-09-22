import fs from "node:fs"

fs.rmSync(new URL("../dist-slides", import.meta.url), { recursive: true, force: true })
