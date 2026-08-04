export type PendingPetAction = {
  prompt?: string
  agent?: string
  autoSubmit?: boolean
  taskId?: string
  handled?: boolean
  queuedAt?: number
}

export function currentPendingPetAction(action: PendingPetAction, now = Date.now()) {
  if (!action.queuedAt) return
  if (now - action.queuedAt > 15_000) return
  return action
}

// 同一个桌宠任务 ID 只允许消费一次：事件重放、sessionStorage 恢复与事件
// 同时到达等竞态都不能用同一个 taskId 重复创建会话
const consumedPetTaskIds = new Set<string>()

export function consumePetTask(taskId: string | undefined) {
  if (!taskId) return true
  if (consumedPetTaskIds.has(taskId)) return false
  consumedPetTaskIds.add(taskId)
  return true
}

export function resetConsumedPetTasks() {
  consumedPetTaskIds.clear()
}
