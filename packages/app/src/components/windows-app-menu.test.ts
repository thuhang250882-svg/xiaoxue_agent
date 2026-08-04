import { describe, expect, test } from "bun:test"
import { blurDesktopMenuFocus } from "./windows-app-menu-focus"

describe("Windows app menu focus lifecycle", () => {
  test("removes focus from the dropdown before opening a dialog", () => {
    document.body.innerHTML = '<div class="desktop-app-menu" tabindex="0"><button>设置</button></div>'
    const menu = document.querySelector(".desktop-app-menu") as HTMLElement
    menu.focus()

    blurDesktopMenuFocus()

    expect(document.activeElement).toBe(document.body)
  })

  test("does not blur focus outside the desktop menu", () => {
    document.body.innerHTML = "<button>设置</button>"
    const button = document.querySelector("button") as HTMLElement
    button.focus()

    blurDesktopMenuFocus()

    expect(document.activeElement).toBe(button)
  })
})
