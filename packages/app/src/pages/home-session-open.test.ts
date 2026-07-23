import { describe, expect, test } from "bun:test"
import { shouldOpenSessionInBackground } from "./home-session-open"
import { ordinaryChatDirectory } from "../utils/ordinary-chat-directory"

const homeSource = await Bun.file(new URL("./home.tsx", import.meta.url)).text()
const titlebarSource = await Bun.file(new URL("../components/titlebar.tsx", import.meta.url)).text()

describe("shouldOpenSessionInBackground", () => {
  test("requires only the platform primary modifier", () => {
    expect(shouldOpenSessionInBackground({ mac: true, meta: true, ctrl: false, shift: false, alt: false })).toBe(true)
    expect(shouldOpenSessionInBackground({ mac: false, meta: false, ctrl: true, shift: false, alt: false })).toBe(true)
    expect(shouldOpenSessionInBackground({ mac: true, meta: true, ctrl: false, shift: true, alt: false })).toBe(false)
    expect(shouldOpenSessionInBackground({ mac: false, meta: false, ctrl: true, shift: false, alt: true })).toBe(false)
    expect(shouldOpenSessionInBackground({ mac: false, meta: true, ctrl: false, shift: false, alt: false })).toBe(false)
  })

  test("starts generic chats from a neutral directory without selecting a project", () => {
    expect(homeSource).toContain("const directory = ordinaryDirectory()")
    expect(homeSource).toContain("setSelection({ server: key })")
    expect(homeSource).toContain("tabs.newDraft({ server: key, directory }, prompt, agent, autoSubmit)")
    expect(titlebarSource).toContain("ordinaryChatDirectory(global.ensureServerCtx(conn).sync.data.path)")
    expect(titlebarSource).toContain("layout.home.setSelection({ server: key })")
    expect(titlebarSource).not.toContain("const fallback = global.servers.list().flatMap")
  })

  test("prefers an existing non-project directory for ordinary chat", () => {
    expect(ordinaryChatDirectory({ tmp: "C:/Temp/opencode", home: "G:/missing-project" })).toBe("C:/Temp/opencode")
    expect(ordinaryChatDirectory({ home: "C:/Users/test" })).toBe("C:/Users/test")
  })

  test("does not pass click events into the new-session prompt", () => {
    expect(homeSource).toContain("onClick={() => openNewSession()}")
    expect(homeSource).toContain("onClick={() => onNewSession()()}")
    expect(homeSource).not.toContain("onClick={openNewSession}")
  })

  test("keeps the primary new-session action visually prominent", () => {
    expect(homeSource).toContain('data-action="home-new-session"')
    expect(homeSource).toContain('variant="contrast"')
    expect(homeSource).toContain('size="large"')
  })
})
