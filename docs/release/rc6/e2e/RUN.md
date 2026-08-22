# RC6 Model E2E — RUN

日期：2026-08-22
目标：在沙盒/开发环境中运行 3 个静态 E2E harness，验证 RC6 业务 Skill 的前置条件。
不依赖真实 model 或 API key。

## 1. 环境要求

- Bun ≥ 1.3
- 工作目录：worktree 根目录（`E:\software programming\opencode-dev-rc6-skill-center` 或主仓库 `e:\software programming\opencode-dev`）
- 网络：不需要
- API key：不需要

## 2. 跑全部 3 个 harness

```bash
bun ./scripts/rc6-e2e/static-analysis.ts
bun ./scripts/rc6-e2e/trigger-mutex.ts
bun ./scripts/rc6-e2e/prompt-injection-guard.ts
```

或一次性跑（推荐，配合保存结果）：

```bash
mkdir -p ./docs/release/rc6/e2e
bun ./scripts/rc6-e2e/static-analysis.ts          > ./docs/release/rc6/e2e/static-analysis-result.txt
bun ./scripts/rc6-e2e/trigger-mutex.ts            > ./docs/release/rc6/e2e/trigger-mutex-result.txt
bun ./scripts/rc6-e2e/prompt-injection-guard.ts   > ./docs/release/rc6/e2e/prompt-injection-guard-result.txt
```

## 3. 跑单个 harness + 单 skill

```bash
bun ./scripts/rc6-e2e/static-analysis.ts --skill 审查合同
bun ./scripts/rc6-e2e/static-analysis.ts --skill knowledge-distill
```

## 4. 严格模式

`--strict` 标志在失败时返回非零 exit code（CI 用）：

```bash
bun ./scripts/rc6-e2e/static-analysis.ts --strict
bun ./scripts/rc6-e2e/trigger-mutex.ts          # 默认仅 core skill 失败才 exit 1
bun ./scripts/rc6-e2e/prompt-injection-guard.ts  # 默认失败即 exit 1
```

## 5. 退出条件

- `static-analysis`: 4 个 RC6 业务 Skill 全部通过所有 checks（35/35）
- `trigger-mutex`: 4 个核心 RC6 业务 Skill 全部命中（8/8）；reference Skill 失败仅记录、不影响 exit code
- `prompt-injection-guard`: 4 个 RC6 业务 Skill 全部通过 guard 关键词 + originalText/quote contract

## 6. 常见问题

### Q1: Bun.YAML 不可用？

```bash
bun --version   # 须 ≥ 1.3
```

Bun ≥ 1.3 自带 `Bun.YAML.parse()`。脚本同时支持 fallback 手写 parser。

### Q2: Windows 路径反斜杠问题？

`static-analysis.ts` 已将 `relative(dir, p)` 转换为 forward slash 后再比较。

### Q3: description 是 YAML folded block (`>`) 怎么办？

Bun.YAML 解析后是单字符串，trigger 抽取 regex 支持：
- `当用户要求'X'、'Y'时触发`
- `Trigger when the user asks to "X"`
- `Use when the user asks to X. Do not use for Y`

### Q4: harness 不覆盖什么？

- 不调用 model、不验证响应
- 不验证 Skill 工作流（这是真实 model E2E 的事）
- 不验证 visual output / DOCX 渲染

## 7. 集成 CI

可在 GitHub Actions 中加：

```yaml
- name: RC6 E2E static harness
  run: |
    bun ./scripts/rc6-e2e/static-analysis.ts --strict
    bun ./scripts/rc6-e2e/trigger-mutex.ts
    bun ./scripts/rc6-e2e/prompt-injection-guard.ts
```

退出码非 0 即视为 RC6 业务 Skill 退化，需要人工审查。