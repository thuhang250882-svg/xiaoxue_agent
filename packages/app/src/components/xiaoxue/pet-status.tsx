import { createSignal } from "solid-js"
import type { XiaoxueState } from "../../../../../avatar/xiaoxue_pet/state"
import { XiaoxuePet } from "./XiaoxuePet"

export default function PetStatus(props: { initialState?: XiaoxueState; message?: string }) {
  return <XiaoxuePet state={props.initialState ?? "idle"} message={props.message} />
}

export function usePetState() {
  const [state, setState] = createSignal<XiaoxueState>("idle")
  return {
    state,
    setState,
    setWaiting: () => setState("waiting"),
    setWriting: () => setState("writing"),
    setReviewing: () => setState("reviewing"),
    setThinking: () => setState("thinking"),
    setSpeaking: () => setState("speaking"),
    setSearching: () => setState("searching"),
    setReading: () => setState("reading"),
    setSuccess: () => setState("success"),
    setCelebrate: () => setState("celebrate"),
    setError: () => setState("error"),
    setIdle: () => setState("idle"),
  }
}