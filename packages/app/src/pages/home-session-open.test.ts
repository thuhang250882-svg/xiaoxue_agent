import { describe, expect, test } from "bun:test"
import { shouldOpenSessionInBackground } from "./home-session-open"
import { ordinaryChatDirectory } from "../utils/ordinary-chat-directory"

const homeSource = (
  await Promise.all(
    ["home.tsx", "home/home-controller.ts", "home/home-sessions-controller.tsx", "home/home-sessions-view.tsx"].map(
      (file) => Bun.file(new URL(file, import.meta.url)).text(),
    ),
  )
).join("\n")
const newSessionSource = (
  await Promise.all(
    ["new-session.tsx", "new-session/new-session-draft-controller.ts"].map((file) =>
      Bun.file(new URL(file, import.meta.url)).text(),
    ),
  )
).join("\n")
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

  test("starts generic chats from a neutral directory without selecting a project", () => {
    expect(homeSource).toContain("const directory = ordinaryDirectory()")
    expect(homeSource).toContain("setSelection({ server: key })")
    expect(homeSource).toContain(
      "tabs.newDraft({ server: key, directory, xiaoxueTaskId }, prompt, undefined, agent, autoSubmit)",
    )
    expect(titlebarSource).toContain("ordinaryChatDirectory(global.ensureServerCtx(conn).sync.data.path)")
    expect(titlebarSource).toContain("layout.home.setSelection({ server: key })")
    expect(titlebarSource).not.toContain("const fallback = global.servers.list().flatMap")
  })

  test("prefers an existing non-project directory for ordinary chat", () => {
    expect(ordinaryChatDirectory({ tmp: "C:/Temp/opencode", home: "G:/missing-project" })).toBe("C:/Temp/opencode")
    expect(ordinaryChatDirectory({ home: "C:/Users/test" })).toBe("C:/Users/test")
  })

  test("does not pass click events into the new-session prompt", () => {
    expect(homeSource).toContain("onClick={() => props.onCreateSession()}")
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

  test("fills the available home panel width", () => {
    expect(homeSource).toContain("lg:grid-cols-[280px_minmax(0,1fr)]")
    expect(homeSource).not.toContain("max-w-[1080px]")
    expect(homeSource).not.toContain("minmax(0,720px)")
  })
})
