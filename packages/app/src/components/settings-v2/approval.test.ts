import { describe, expect, test } from "bun:test"

const component = await Bun.file(import.meta.dir + "/approval.tsx").text()
const styles = await Bun.file(import.meta.dir + "/settings-v2.css").text()

describe("approval settings", () => {
  test("offers the three approval modes and persists through config", () => {
    expect(component).toContain('value: "request"')
    expect(component).toContain('value: "auto"')
    expect(component).toContain('value: "full"')
    expect(component).toContain("approval_mode: value")
    expect(component).toContain("settings.permissions.toast.updateFailed.title")
  })

  test("uses an accessible single-choice control", () => {
    expect(component).toContain('role="radiogroup"')
    expect(component).toContain('role="radio"')
    expect(component).toContain("aria-checked")
  })

  test("visually distinguishes selection and full access risk", () => {
    expect(styles).toContain(".settings-v2-approval-option-selected")
    expect(styles).toContain(".settings-v2-approval-option-danger.settings-v2-approval-option-selected")
    expect(styles).toContain("var(--v2-state-fg-warning)")
  })
})
