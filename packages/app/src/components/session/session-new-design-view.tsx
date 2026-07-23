import type { JSX } from "solid-js"
import { NEW_SESSION_CONTENT_WIDTH } from "@/pages/session/new-session-layout"

export function NewSessionDesignView(props: { children: JSX.Element }) {
  return (
    <div data-component="session-new-design" class="relative size-full overflow-hidden bg-v2-background-bg-deep ">
      <div class="absolute inset-x-0 top-[25.375%] flex justify-center px-6">
        <div class={NEW_SESSION_CONTENT_WIDTH}>
          <div class="flex flex-col items-center" aria-hidden="true">
            <img
              src="/logo-xiaoxue.png"
              alt=""
              class="h-36 w-36 object-contain opacity-25 drop-shadow-[0_16px_36px_rgba(0,0,0,0.28)]"
            />
            <div class="mt-2 pl-[0.34em] text-2xl font-semibold tracking-[0.34em] text-v2-text-text-faint opacity-60">
              XIAOXUE
            </div>
          </div>
          <div class="mt-6">{props.children}</div>
        </div>
      </div>
    </div>
  )
}
