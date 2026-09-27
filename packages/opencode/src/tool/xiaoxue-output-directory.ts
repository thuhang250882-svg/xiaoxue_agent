import path from "node:path"

export function xiaoxueOutputDirectory(directory: string) {
  if (!path.isAbsolute(directory)) throw new Error("当前工作目录不是绝对路径，无法保存小雪交付文件。")
  return path.join(directory, "小雪交付文件")
}
