export type GateCheckpoint = {
  turn: number
  state: {
    globalBytes: number
    workspaceBytes: number
    draftBytes: number
    orphanDrafts: number
    semanticAmplification: boolean
  }
  memory: {
    rendererMedianBytes: number
    rendererPeakBytes: number
    mainMedianBytes: number
    mainPeakBytes: number
  }
}

export type GateInput = {
  checkpoints: GateCheckpoint[]
  integrity: {
    expectedMessages: number
    actualMessages: number
    lost: number
    duplicate: number
    corrupt: number
    unfinished: number
  }
  restart: {
    mainPidChanged: boolean
    rendererPidChanged: boolean
    reopened: boolean
    continued: boolean
    fullUsableReopenMs: number
    preRestartRendererPeakBytes: number
    postRestartRendererBytes: number
  }
  firstTokenP95Ms: number
}

const MiB = 1024 * 1024

export function evaluateDesktopAc02(input: GateInput) {
  const failures: string[] = []
  const warnings: string[] = []
  const baseline = requireCheckpoint(input.checkpoints, 0)
  const at500 = requireCheckpoint(input.checkpoints, 500)
  const final = requireCheckpoint(input.checkpoints, 1_000)
  const delta = {
    global: final.state.globalBytes - baseline.state.globalBytes,
    workspace: final.state.workspaceBytes - baseline.state.workspaceBytes,
    draft: final.state.draftBytes - baseline.state.draftBytes,
    combined:
      final.state.globalBytes +
      final.state.workspaceBytes +
      final.state.draftBytes -
      baseline.state.globalBytes -
      baseline.state.workspaceBytes -
      baseline.state.draftBytes,
  }
  const halves = {
    first:
      at500.state.globalBytes +
      at500.state.workspaceBytes +
      at500.state.draftBytes -
      baseline.state.globalBytes -
      baseline.state.workspaceBytes -
      baseline.state.draftBytes,
    second:
      final.state.globalBytes +
      final.state.workspaceBytes +
      final.state.draftBytes -
      at500.state.globalBytes -
      at500.state.workspaceBytes -
      at500.state.draftBytes,
  }

  if (input.integrity.actualMessages !== input.integrity.expectedMessages) failures.push("INTEGRITY_MESSAGE_COUNT")
  if (input.integrity.lost) failures.push("INTEGRITY_LOST")
  if (input.integrity.duplicate) failures.push("INTEGRITY_DUPLICATE")
  if (input.integrity.corrupt) failures.push("INTEGRITY_CORRUPT")
  if (input.integrity.unfinished) failures.push("INTEGRITY_UNFINISHED")
  if (!input.restart.mainPidChanged) failures.push("RESTART_MAIN_PID")
  if (!input.restart.rendererPidChanged) failures.push("RESTART_RENDERER_PID")
  if (!input.restart.reopened) failures.push("RESTART_REOPEN")
  if (!input.restart.continued) failures.push("RESTART_CONTINUE")
  if (input.restart.fullUsableReopenMs > 5_000) failures.push("RESTART_REOPEN_TIME")
  else if (input.restart.fullUsableReopenMs > 2_000) warnings.push("RESTART_REOPEN_TIME")
  if (input.restart.postRestartRendererBytes >= input.restart.preRestartRendererPeakBytes)
    failures.push("RESTART_RENDERER_RELEASE")
  if (delta.global > 8 * MiB) failures.push("STATE_GLOBAL_DELTA")
  if (delta.workspace > 16 * MiB) failures.push("STATE_WORKSPACE_DELTA")
  if (delta.draft > 8 * MiB) failures.push("STATE_DRAFT_DELTA")
  if (delta.combined > 24 * MiB) failures.push("STATE_COMBINED_DELTA")
  if (final.state.orphanDrafts) failures.push("DRAFT_ORPHAN")
  if (final.state.semanticAmplification) failures.push("STATE_SEMANTIC_AMPLIFICATION")
  if (halves.second > 1.5 * Math.max(halves.first, MiB)) failures.push("STATE_SECOND_HALF_GROWTH")
  if (final.memory.rendererPeakBytes > 1536 * MiB) failures.push("MEMORY_RENDERER_PEAK")
  else if (final.memory.rendererPeakBytes > 1024 * MiB) warnings.push("MEMORY_RENDERER_PEAK")
  if (final.memory.mainPeakBytes > 1024 * MiB) failures.push("MEMORY_MAIN_PEAK")
  else if (final.memory.mainPeakBytes > 512 * MiB) warnings.push("MEMORY_MAIN_PEAK")
  if (input.firstTokenP95Ms > 500) warnings.push("FIRST_TOKEN_P95")

  return { result: failures.length ? ("FAIL" as const) : ("PASS" as const), failures, warnings, delta, halves }
}

function requireCheckpoint(checkpoints: GateCheckpoint[], turn: number) {
  const checkpoint = checkpoints.find((item) => item.turn === turn)
  if (!checkpoint) throw new Error(`Missing checkpoint ${turn}`)
  return checkpoint
}
