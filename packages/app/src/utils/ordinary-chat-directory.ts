type InstancePath = {
  tmp?: string
  state?: string
  home?: string
  directory?: string
}

export function ordinaryChatDirectory(path: InstancePath) {
  if (path.state) return path.state
  if (!path.directory || path.directory === path.tmp) return ""
  return path.directory
}
