import { Component, For, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"

export type DroppedKnowledgeChoice = "attachment" | "knowledge-import" | null

export type DialogDroppedFileChoiceProps = {
  files: string[]
  onChoose: (choice: DroppedKnowledgeChoice) => void
}

/**
 * 拖入知识型文档（PDF/DOCX/XLSX…）时的意图选择：
 * 同一个手势可能意味着"帮我处理这份文档"（对话附件）或"存进企业知识库"（受控导入）。
 * 低基础用户不该被猜测意图——显式问一次，一次点击即完成。
 */
export const DialogDroppedFileChoice: Component<DialogDroppedFileChoiceProps> = (props) => {
  const dialog = useDialog()
  const names = () => props.files.map((file) => file.split(/[\\/]/).pop() ?? file)
  const finish = (choice: DroppedKnowledgeChoice) => {
    dialog.close()
    props.onChoose(choice)
  }

  return (
    <Dialog
      title="拖入了资料文档"
      description={
        names().length === 1
          ? `「${names()[0]}」要如何处理？`
          : `共 ${names().length} 份文档（${names().slice(0, 3).join("、")}${names().length > 3 ? " 等" : ""}），要如何处理？`
      }
    >
      <div class="flex flex-col gap-2 p-3">
        <button
          type="button"
          data-action="dropped-file-attachment"
          class="flex items-start gap-3 rounded-[8px] border border-v2-border-border-muted p-3 text-left transition-colors hover:border-v2-border-border-base"
          onClick={() => finish("attachment")}
        >
          <Icon name="file-lines" class="mt-0.5 size-5 shrink-0 text-v2-icon-icon-base" />
          <span class="flex min-w-0 flex-col gap-1">
            <span class="text-[13px] [font-weight:600] text-v2-text-text-base">作为对话附件</span>
            <span class="text-[12px] leading-4 text-v2-text-text-muted">
              把文档发给智能体处理（审核、翻译、改写、提问等），本次对话内有效。
            </span>
          </span>
        </button>
        <button
          type="button"
          data-action="dropped-file-knowledge-import"
          class="flex items-start gap-3 rounded-[8px] border border-v2-border-border-muted p-3 text-left transition-colors hover:border-v2-border-border-base"
          onClick={() => finish("knowledge-import")}
        >
          <Icon name="archive" class="mt-0.5 size-5 shrink-0 text-v2-icon-icon-base" />
          <span class="flex min-w-0 flex-col gap-1">
            <span class="text-[13px] [font-weight:600] text-v2-text-text-base">导入企业知识库</span>
            <span class="text-[12px] leading-4 text-v2-text-text-muted">
              长期保存并建立检索索引（默认分类：标准规范），之后随时可查询引用。
            </span>
          </span>
        </button>
        <Show when={names().length > 1}>
          <div class="px-1 pt-1 text-[11px] leading-4 text-v2-text-text-muted">
            <For each={names()}>{(name) => <div class="truncate">{name}</div>}</For>
          </div>
        </Show>
        <div class="flex justify-end pt-1">
          <ButtonV2 variant="ghost-muted" size="small" onClick={() => finish(null)}>
            取消
          </ButtonV2>
        </div>
      </div>
    </Dialog>
  )
}
