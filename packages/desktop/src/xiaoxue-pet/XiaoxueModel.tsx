import { ThreePetRenderer, type XiaoxueState } from "@opencode-ai/app"

export function XiaoxueModel(props: { state: XiaoxueState; mode?: "avatar" | "expanded" }) {
  return (
    <div class="h-full w-full">
      <ThreePetRenderer state={props.state} mode={props.mode} />
    </div>
  )
}
