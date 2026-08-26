import { type Component } from "solid-js"

type SkillsToolbarProps = {
  searchQuery: string
  filterMode: "all" | "enabled" | "disabled"
  onSearchChange: (query: string) => void
  onFilterChange: (mode: "all" | "enabled" | "disabled") => void
}

export const SkillsToolbar: Component<SkillsToolbarProps> = (props) => {
  return (
    <div class="settings-v2-skills-toolbar">
      <input
        class="settings-v2-skills-search"
        type="text"
        placeholder="搜索 Skill…"
        value={props.searchQuery}
        onInput={(e) => props.onSearchChange(e.currentTarget.value)}
      />
      <div class="settings-v2-skills-filters">
        <button
          class="settings-v2-skills-filter"
          data-selected={props.filterMode === "all" ? "" : undefined}
          onClick={() => props.onFilterChange("all")}
        >
          全部
        </button>
        <button
          class="settings-v2-skills-filter"
          data-selected={props.filterMode === "enabled" ? "" : undefined}
          onClick={() => props.onFilterChange("enabled")}
        >
          已启用
        </button>
        <button
          class="settings-v2-skills-filter"
          data-selected={props.filterMode === "disabled" ? "" : undefined}
          onClick={() => props.onFilterChange("disabled")}
        >
          已禁用
        </button>
      </div>
    </div>
  )
}

