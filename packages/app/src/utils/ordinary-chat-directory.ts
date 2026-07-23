type InstancePath = {
  tmp?: string
  state?: string
  home?: string
  directory?: string
}

export function ordinaryChatDirectory(path: InstancePath) {
  return path.tmp || path.home || path.directory || ""
}
