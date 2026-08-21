import { describe, expect, test } from "bun:test"
import { shouldOpenSessionInBackground } from "./home-session-open"
import { ordinaryChatDirectory } from "../utils/ordinary-chat-directory"

const homeSource = await Bun.file(new URL("./home.tsx", import.meta.url)).text()
const newSessionSource = await Bun.file(new URL("./new-session.tsx", import.meta.url)).text()
const titlebarSource = await Bun.file(new URL("../components/titlebar.tsx", import.meta.url)).text()

describe("shouldOpenSessionInBackground", () => {
  test("opens middle clicks in the background", () => {
    expect(
      shouldOpenSessionInBackground({ button: 1, mac: true, meta: false, ctrl: false, shift: false, alt: false }),
    ).toBe(true)
    expect(
      shouldOpenSessionInBackground({ button: 2, mac: true, meta: false, ctrl: false, shift: false, alt: false }),
    ).toBe(false)
  })

  test("requires only the platform primary modifier", () => {
    expect(
      shouldOpenSessionInBackground({ button: 0, mac: true, meta: true, ctrl: false, shift: false, alt: false }),
    ).toBe(true)
    expect(
      shouldOpenSessionInBackground({ button: 0, mac: false, meta: false, ctrl: true, shift: false, alt: false }),
    ).toBe(true)
    expect(
      shouldOpenSessionInBackground({ button: 0, mac: true, meta: true, ctrl: false, shift: true, alt: false }),
    ).toBe(false)
    expect(
      shouldOpenSessionInBackground({ button: 0, mac: false, meta: false, ctrl: true, shift: false, alt: true }),
    ).toBe(false)
    expect(
      shouldOpenSessionInBackground({ button: 0, mac: false, meta: true, ctrl: false, shift: false, alt: false }),
    ).toBe(false)
  })

  test("starts generic chats without assigning a workspace", () => {
    expect(homeSource).toContain("setSelection({ server: key })")
    expect(homeSource).toContain(
      "tabs.newDraft({ server: key, directory, requiresProject: true, xiaoxueTaskId }, prompt, undefined, agent, autoSubmit)",
    )
    expect(titlebarSource).toContain('tabs.newDraft({ server: key, directory, requiresProject: true }, "")')
    expect(titlebarSource).toContain("layout.home.setSelection({ server: key })")
    expect(newSessionSource).toContain("<Show when={!projectController.selected()}>")
  })

  test("never treats temp or home as an implicit project", () => {
    expect(ordinaryChatDirectory({ tmp: "C:/Temp/opencode", home: "C:/Users/test" })).toBe("")
    expect(ordinaryChatDirectory({ tmp: "C:/Temp/opencode", directory: "C:/Temp/opencode" })).toBe("")
    expect(ordinaryChatDirectory({ state: "C:/Users/test/AppData/Local/opencode", tmp: "C:/Temp/opencode" })).toBe(
      "C:/Users/test/AppData/Local/opencode",
    )
    expect(ordinaryChatDirectory({ tmp: "C:/Temp/opencode", directory: "D:/explicit-project" })).toBe(
      "D:/explicit-project",
    )
  })

  test("does not pass click events into the new-session prompt", () => {
    expect(homeSource).toContain("onClick={() => openNewSession()}")
    expect(homeSource).toContain("onClick={() => onNewSession()()}")
    expect(homeSource).not.toContain("onClick={openNewSession}")
  })

  test("does not recover a stale pet task into an ordinary new session", () => {
    expect(newSessionSource).not.toContain("consumePendingTask")
    expect(newSessionSource).toContain("Pet actions enter through Home with an explicit prompt and task ID")
  })

  test("keeps the primary new-session action visually prominent", () => {
    expect(homeSource).toContain('data-action="home-new-session"')
    expect(homeSource).toContain('variant="contrast"')
    expect(homeSource).toContain('size="large"')
    expect(homeSource.match(/data-action="home-new-session"/g)?.length).toBe(2)
  })

  test("keeps business workflows above historical tasks even when sessions exist", () => {
    expect(homeSource).toContain("录井小雪工作台")
    expect(homeSource).toContain("历史任务")
    expect(homeSource.indexOf("<HomeSessionsEmpty")).toBeLessThan(homeSource.indexOf("历史任务"))
  })
})
