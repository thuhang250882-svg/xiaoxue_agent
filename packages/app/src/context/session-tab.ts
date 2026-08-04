import type { ServerConnection } from "./server"
import type { SessionTab, Tab } from "./tabs"
import { sessionHref } from "@/utils/session-route"

export const sessionTabKey = (tab: Tab) =>
  tab.type === "draft" ? `draft:${tab.draftID}` : `${tab.server}\n${sessionHref(tab.server, tab.sessionId)}`

export function desktopStartupTabs(tabs: Tab[], recentKey: string | undefined) {
  const sessions = tabs.filter((tab): tab is SessionTab => tab.type === "session")
  return {
    tabs: sessions,
    active: sessions.find((tab) => sessionTabKey(tab) === recentKey) ?? sessions.at(-1),
  }
}

export function sessionTabIsOpen(tabs: Tab[], server: ServerConnection.Key, sessionID: string) {
  return tabs.some((tab) => tab.type === "session" && tab.server === server && tab.sessionId === sessionID)
}
