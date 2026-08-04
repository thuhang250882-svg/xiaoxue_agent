// 提交状态机：idle → creating_session → submitting_prompt → completed/failed。
// 从 creating_session 开始禁止重复提交，双击发送/连续 Enter 只会创建一个
// Session。由同步状态锁保证（不依赖 setTimeout 防抖）：handleSubmit 在任何
// 终态退出（校验失败、入队、请求发出、发送失败）时释放锁，失败后可重试。
export type SubmitPhase = "idle" | "creating_session" | "submitting_prompt"

export function createSubmitGuard() {
  let phase: SubmitPhase = "idle"
  const listeners = new Set<(phase: SubmitPhase) => void>()

  const set = (next: SubmitPhase) => {
    if (phase === next) return
    phase = next
    for (const listener of listeners) listener(phase)
  }

  return {
    phase: () => phase,
    busy: () => phase !== "idle",
    // 原子进入 creating_session；已有提交在进行时返回 false，调用方必须直接放弃
    tryBegin: () => {
      if (phase !== "idle") return false
      set("creating_session")
      return true
    },
    advance: () => set("submitting_prompt"),
    release: () => set("idle"),
    subscribe: (listener: (phase: SubmitPhase) => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export type SubmitGuard = ReturnType<typeof createSubmitGuard>
