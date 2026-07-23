import { XiaoxueWebP, type XiaoxueState } from "@opencode-ai/app"

export function XiaoxueModel(props: { state: XiaoxueState; mode?: "avatar" | "expanded" }) {
  return <XiaoxueWebP state={props.state} />
}