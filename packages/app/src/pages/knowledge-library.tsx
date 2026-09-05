import { createMemo, createSignal, For, Show } from "solid-js"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { useLayout } from "@/context/layout"
import { useGlobal } from "@/context/global"
import { ServerConnection, useServer } from "@/context/server"
import { useTabs } from "@/context/tabs"
import { useNavigate } from "@solidjs/router"
import { usePlatform } from "@/context/platform"
import { showToast } from "@/utils/toast"

const categories = [
  ["standard", "标准规范"],
  ["company_rule", "公司制度"],
  ["template", "报告模板"],
  ["excellent_report", "优秀报告"],
  ["expert_experience", "专家经验"],
] as const

const actions = [
  { id: "import", title: "导入资料", description: "上传 DOCX、XLSX 或文本资料，自动去重并建立索引。", icon: "folder-add-left" },
  { id: "update", title: "更新版本", description: "以新附件替换指定资料，旧版本转入归档并保留追溯关系。", icon: "edit" },
  { id: "list", title: "资料清单", description: "查看当前有效资料、版本、分类、来源和更新时间。", icon: "archive" },
  { id: "search", title: "知识查询", description: "检索制度、标准、模板、案例和专家经验，并返回来源。", icon: "magnifying-glass" },
  { id: "remove", title: "移除资料", description: "按资料编号发起移除任务，操作前由智能体再次确认。", icon: "trash" },
] as const

export default function KnowledgeLibraryPage() {
  const layout = useLayout()
  const global = useGlobal()
  const server = useServer()
  const tabs = useTabs()
  const navigate = useNavigate()
  const platform = usePlatform()
  const [category, setCategory] = createSignal<(typeof categories)[number][0]>("standard")
  const [sourceID, setSourceID] = createSignal("")
  const [query, setQuery] = createSignal("")
  const selection = layout.home.selection
  const connection = createMemo(
    () => global.servers.list().find((item) => ServerConnection.key(item) === selection().server) ?? server.current,
  )
  const project = createMemo(() => {
    const current = connection()
    if (!current) return
    const projects = global.ensureServerCtx(current).projects
    return projects.list().find((item) => item.worktree === selection().directory) ?? projects.list()[0]
  })

  const start = async (action: (typeof actions)[number]["id"]) => {
    const current = connection()
    const workspace = project()
    if (!current || !workspace) {
      showToast({ title: "无法执行知识任务", description: "请先打开一个项目。" })
      return
    }
    if ((action === "update" || action === "remove") && !sourceID().trim()) {
      showToast({ title: "缺少资料编号", description: "更新或移除资料前，请先填写资料编号。" })
      return
    }
    const categoryName = categories.find((item) => item[0] === category())?.[1] ?? category()
    const prompt = {
      import: `[企业知识库操作：import] 已选择真实附件。第一步必须执行 knowledge_manage import，资料分类：${categoryName}（${category()}）。禁止只读取、预览或整理附件；工具成功后再返回可追溯的导入结果。`,
      update: `[企业知识库操作：update] 已选择真实新版本附件。第一步必须执行 knowledge_manage update，资料编号：${sourceID() || "（请补充资料编号）"}，资料分类：${categoryName}（${category()}）。禁止只预览附件；必须保留旧版本归档和版本关系。`,
      list: `[企业知识库操作：list] 第一步必须执行 knowledge_manage list，列出企业知识库当前有效资料。分类筛选：${category()}。结果需包含资料编号、标题、分类、版本、来源文件和更新时间。`,
      search: `请查询企业知识库：${query() || "请列出该分类下可用资料"}。优先检索 ${categoryName}，回答必须标明真实资料来源，未检索到可靠依据时明确说明。`,
      remove: `请准备移除知识资料 ${sourceID() || "（请补充资料编号）"}。先核对资料标题、版本和来源，得到我的明确确认后再执行 knowledge_manage remove。`,
    }[action]
    const files: string[] = []
    if (action === "import" || action === "update") {
      if (!platform.openAttachmentPickerDialog || !platform.getPathForFile) {
        showToast({ title: "桌面文件选择不可用", description: "请从录井小雪桌面版打开知识库。" })
        return
      }
      try {
        await platform.openAttachmentPickerDialog(
        {
          title: action === "import" ? "选择要导入知识库的资料" : "选择知识资料的新版本",
          multiple: action === "import",
          extensions: ["docx", "xlsx", "txt", "md", "csv"],
        },
          async (file) => {
            const path = platform.getPathForFile?.(file)
            if (path) files.push(path)
          },
        )
      } catch (error) {
        showToast({
          title: "选择文件失败",
          description: error instanceof Error ? error.message : "无法读取所选文件。",
        })
        return
      }
      if (!files.length) return
    }
    const autoSubmit = action === "list" || action === "search" || files.length > 0
    tabs.newDraft(
      { server: ServerConnection.key(current), directory: workspace.worktree },
      prompt,
      undefined,
      "knowledge",
      autoSubmit,
      files,
    )
  }
  return (
    <main class="m-2 min-h-0 min-w-0 flex-1 self-stretch overflow-auto rounded-[8px] bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]">
      <div class="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-10">
        <header class="flex flex-wrap items-start justify-between gap-4 border-b border-v2-border-border-muted pb-5">
          <div class="flex min-w-0 flex-col gap-2">
            <div class="flex items-center gap-2">
              <span class="flex size-8 items-center justify-center rounded-[6px] border border-v2-border-border-muted text-v2-icon-icon-base">
                <IconV2 name="archive" />
              </span>
              <h1 class="text-[18px] leading-6 text-v2-text-text-base [font-weight:600]">企业知识库</h1>
            </div>
            <p class="max-w-[680px] text-[13px] leading-5 text-v2-text-text-muted">
              管理标准规范、公司制度、报告模板、优秀案例和专家经验。所有操作通过知识智能体执行并保留来源与版本关系。
            </p>
          </div>
          <ButtonV2 variant="ghost-muted" size="normal" icon="arrow-left" onClick={() => navigate("/")}>返回工作台</ButtonV2>
        </header>

        <section
          class="grid gap-4 border-b border-v2-border-border-muted pb-6"
          style={{ "grid-template-columns": "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}
        >
          <label class="flex min-w-0 flex-col gap-2 text-[12px] text-v2-text-text-muted">
            资料分类
            <select class="h-9 rounded-[6px] border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-3 text-[13px] text-v2-text-text-base outline-none focus:border-v2-border-border-base" value={category()} onInput={(event) => setCategory(event.currentTarget.value as ReturnType<typeof category>)}>
              <For each={categories}>{(item) => <option value={item[0]}>{item[1]}</option>}</For>
            </select>
          </label>
          <label class="flex min-w-0 flex-col gap-2 text-[12px] text-v2-text-text-muted">
            资料编号
            <input class="h-9 rounded-[6px] border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-3 text-[13px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-muted focus:border-v2-border-border-base" value={sourceID()} onInput={(event) => setSourceID(event.currentTarget.value)} placeholder="更新或移除时填写" />
          </label>
          <label class="flex min-w-0 flex-col gap-2 text-[12px] text-v2-text-text-muted">
            查询内容
            <input class="h-9 rounded-[6px] border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-3 text-[13px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-muted focus:border-v2-border-border-base" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} placeholder="制度、标准或专业问题" />
          </label>
        </section>

        <section
          class="grid gap-2"
          style={{ "grid-template-columns": "repeat(auto-fit, minmax(min(100%, 320px), 1fr))" }}
        >
          <For each={actions}>
            {(action) => (
              <button
                type="button"
                disabled={!project() || ((action.id === "update" || action.id === "remove") && !sourceID().trim())}
                class="flex min-h-[104px] min-w-0 items-start gap-3 rounded-[8px] border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-4 py-4 text-left transition-colors hover:border-v2-border-border-base hover:bg-v2-background-bg-layer-02 focus-visible:outline-none focus-visible:border-v2-border-border-base disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-v2-border-border-muted disabled:hover:bg-v2-background-bg-layer-01"
                onClick={() => void start(action.id)}
              >
                <span class="flex size-8 shrink-0 items-center justify-center rounded-[6px] border border-v2-border-border-muted text-v2-icon-icon-muted"><IconV2 name={action.icon} /></span>
                <span class="flex min-w-0 flex-col gap-1">
                  <span class="text-[13px] leading-5 text-v2-text-text-base [font-weight:560]">{action.title}</span>
                  <span class="text-[12px] leading-5 text-v2-text-text-muted">{action.description}</span>
                </span>
              </button>
            )}
          </For>
        </section>

        <Show when={!project()}>
          <div class="rounded-[6px] border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-4 py-3 text-[13px] text-v2-text-text-muted">
            请先返回工作台并打开一个项目，知识管理任务需要在项目会话中运行。
          </div>
        </Show>
      </div>
    </main>
  )
}
