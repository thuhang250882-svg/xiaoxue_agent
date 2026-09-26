import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Document, Packer, Paragraph } from "docx"

const directory = await mkdtemp(path.join(tmpdir(), "xiaoxue-review-gui-"))
const files = [
  { name: "模拟井原稿.docx", text: "模拟井录井报告。模拟井终孔井深 5000 m，正文与附表采用同一口径。" },
  { name: "模拟井人工定稿.docx", text: "模拟井录井报告。模拟井终孔井深 5001 m，正文与附表采用同一口径。" },
]

for (const file of files) {
  await Bun.write(
    path.join(directory, file.name),
    await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph(file.text)] }] })),
  )
}

process.stdout.write(JSON.stringify({ directory, files: files.map((file) => path.join(directory, file.name)) }) + "\n")
