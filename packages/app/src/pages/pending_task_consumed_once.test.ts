import { beforeEach, describe, expect, test } from "bun:test"
import { consumePetTask, resetConsumedPetTasks } from "./pending-pet-action"

beforeEach(resetConsumedPetTasks)

describe("pending pet task is consumed once", () => {
  test("the same task id can only be consumed once", () => {
    expect(consumePetTask("task-1")).toBe(true)
    expect(consumePetTask("task-1")).toBe(false)
    expect(consumePetTask("task-1")).toBe(false)
  })

  test("duplicate delivery across event and session restore still consumes once", () => {
    // 模拟同一 taskId 同时经由 xiaoxue:pet-action 事件与 sessionStorage 恢复到达
    const eventDelivery = consumePetTask("task-dup")
    const restoreDelivery = consumePetTask("task-dup")
    expect(eventDelivery).toBe(true)
    expect(restoreDelivery).toBe(false)
  })

  test("distinct task ids are consumed independently", () => {
    expect(consumePetTask("task-a")).toBe(true)
    expect(consumePetTask("task-b")).toBe(true)
  })

  test("actions without task id are never blocked", () => {
    expect(consumePetTask(undefined)).toBe(true)
    expect(consumePetTask(undefined)).toBe(true)
  })
})
