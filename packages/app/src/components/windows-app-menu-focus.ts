export function blurDesktopMenuFocus() {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return
  if (!active.closest(".desktop-app-menu")) return
  active.blur()
}
