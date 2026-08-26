import { Button } from "@opencode-ai/ui/button"
import { Switch } from "@opencode-ai/ui/v2/switch-v2"
import { TextField } from "@opencode-ai/ui/text-field"
import { createResource, createSignal, For, Show } from "solid-js"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useProviders } from "@/hooks/use-providers"
import {
  createModelRegistryClient,
  type ManagedModel,
  type ModelReference,
  type RegistryError,
} from "@/utils/model-registry-client"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"

const SOURCE_LABEL: Record<ManagedModel["source"], string> = {
  builtin: "内置",
  discovered: "自动发现",
  custom: "自定义",
}

type FormState = {
  providerId: string
  modelId: string
  displayName: string
  contextWindow: string
}

export function ModelRegistrySection() {
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const providers = useProviders()

  const client = () => createModelRegistryClient(serverSDK().url, serverSDK().server.http)
  const [data, { refetch }] = createResource(() => client().list())
  const [form, setForm] = createSignal<{ key?: string } & FormState | undefined>(undefined)
  const [deleting, setDeleting] = createSignal<ManagedModel | undefined>(undefined)
  const [busy, setBusy] = createSignal(false)

  const configuredProviders = () =>
    serverSync().data.provider.all.size
      ? [...serverSync().data.provider.all.entries()]
      : providers.connected().map((p) => [p.id, p] as const)

  const notify = (title: string, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    const code = (error as RegistryError)?.code
    showToast({ title, description: code ? `[${code}] ${message}` : message })
  }

  const run = async (title: string, action: () => Promise<void>) => {
    if (busy()) return
    setBusy(true)
    try {
      await action()
      await refetch()
    } catch (error) {
      notify(title, error)
    } finally {
      setBusy(false)
    }
  }

  const saveForm = () => {
    const state = form()
    if (!state) return
    const providerId = state.providerId.trim()
    const modelId = state.modelId.trim()
    if (!providerId || !modelId) {
      showToast({ title: "校验失败", description: "Provider 与 Model ID 不能为空" })
      return
    }
    void run(state.key ? "保存模型失败" : "新增模型失败", async () => {
      const contextWindow = Number(state.contextWindow)
      if (state.key) {
        await client().update(state.key, {
          modelId,
          displayName: state.displayName.trim() || undefined,
          contextWindow: Number.isFinite(contextWindow) && contextWindow > 0 ? contextWindow : undefined,
        })
      } else {
        await client().create({
          providerId,
          modelId,
          displayName: state.displayName.trim() || undefined,
          contextWindow: Number.isFinite(contextWindow) && contextWindow > 0 ? contextWindow : undefined,
        })
      }
      setForm(undefined)
    })
  }

  const toggleEnabled = (model: ManagedModel, enabled: boolean) => {
    void run(enabled ? "启用模型失败" : "禁用模型失败", async () => {
      await client().update(model.key, { enabled })
    })
  }

  const setDefault = (model: ManagedModel) => {
    void run("设置默认模型失败", async () => {
      await serverSync().updateConfig({ model: `${model.providerId}/${model.modelId}` })
    })
  }

  const testConnection = async (model: ManagedModel) => {
    try {
      const result = await client().test(model.key)
      if (result.ok) showToast({ title: "连接成功", description: `${model.providerId}/${model.modelId} 响应正常（${result.latencyMs}ms）` })
      else showToast({ title: "连接失败", description: `[${result.error}] ${result.message}` })
    } catch (error) {
      notify("测试连接失败", error)
    }
  }

  return (
    <div class="settings-v2-section" data-component="settings-model-registry">
      <div class="settings-v2-models-group-header">
        <h3 class="settings-v2-section-title">本地模型管理</h3>
        <Button
          variant="secondary"
          size="small"
          disabled={busy()}
          onClick={() =>
            setForm({
              providerId: configuredProviders()[0]?.[0] ?? "",
              modelId: "",
              displayName: "",
              contextWindow: "",
            })
          }
        >
          新增模型
        </Button>
      </div>

      <Show when={data.error}>
        <div class="settings-v2-models-status">模型注册表加载失败：{String(data.error)}</div>
      </Show>

      <Show when={form()}>
        {(state) => (
          <div class="settings-v2-model-registry-form">
            <SettingsListV2>
              <SettingsRowV2 title="Provider" description="模型所属 Provider">
                <select
                  class="settings-v2-model-registry-select"
                  disabled={!!state().key}
                  value={state().providerId}
                  onChange={(event) => setForm((current) => current && { ...current, providerId: event.currentTarget.value })}
                >
                  <For each={configuredProviders()}>
                    {([id]) => <option value={id}>{id}</option>}
                  </For>
                </select>
              </SettingsRowV2>
              <SettingsRowV2 title="Model ID" description="Provider 侧实际模型 ID">
                <TextField
                  value={state().modelId}
                  onInput={(event) => setForm((current) => current && { ...current, modelId: event.currentTarget.value })}
                  placeholder="例如 qwen3-32b"
                />
              </SettingsRowV2>
              <SettingsRowV2 title="显示名称" description="可选，便于识别">
                <TextField
                  value={state().displayName}
                  onInput={(event) => setForm((current) => current && { ...current, displayName: event.currentTarget.value })}
                  placeholder="可选"
                />
              </SettingsRowV2>
              <SettingsRowV2 title="上下文窗口" description="可选，token 数">
                <TextField
                  value={state().contextWindow}
                  onInput={(event) => setForm((current) => current && { ...current, contextWindow: event.currentTarget.value })}
                  placeholder="例如 32768"
                />
              </SettingsRowV2>
              <SettingsRowV2 title="" description="">
                <div class="settings-v2-model-registry-actions">
                  <Button variant="primary" size="small" disabled={busy()} onClick={saveForm}>
                    保存
                  </Button>
                  <Button variant="secondary" size="small" disabled={busy()} onClick={() => setForm(undefined)}>
                    取消
                  </Button>
                </div>
              </SettingsRowV2>
            </SettingsListV2>
          </div>
        )}
      </Show>

      <SettingsListV2>
        <Show
          when={(data.latest?.models.length ?? 0) > 0}
          fallback={
            <SettingsRowV2 title="暂无托管模型" description="点击“新增模型”添加本地部署的模型">
              <span />
            </SettingsRowV2>
          }
        >
          <For each={data.latest?.models ?? []}>
            {(model) => (
              <SettingsRowV2
                title={model.displayName}
                description={`${SOURCE_LABEL[model.source]} · ${model.providerId}/${model.modelId}`}
              >
                <div class="settings-v2-model-registry-actions">
                  <Switch
                    checked={model.enabled}
                    onChange={(checked) => toggleEnabled(model, checked)}
                    hideLabel
                  >
                    {model.enabled ? "已启用" : "已禁用"}
                  </Switch>
                  <Show when={model.source === "custom"}>
                    <Button
                      variant="secondary"
                      size="small"
                      disabled={busy()}
                      onClick={() =>
                        setForm({
                          key: model.key,
                          providerId: model.providerId,
                          modelId: model.modelId,
                          displayName: model.displayName,
                          contextWindow: model.contextWindow ? String(model.contextWindow) : "",
                        })
                      }
                    >
                      编辑
                    </Button>
                  </Show>
                  <Button variant="secondary" size="small" disabled={busy()} onClick={() => void testConnection(model)}>
                    测试
                  </Button>
                  <Button variant="secondary" size="small" disabled={busy()} onClick={() => setDefault(model)}>
                    设为默认
                  </Button>
                  <Show when={model.source !== "builtin"}>
                    <Button
                      variant="secondary"
                      size="small"
                      disabled={busy()}
                      onClick={() => setDeleting(model)}
                    >
                      删除
                    </Button>
                  </Show>
                </div>
              </SettingsRowV2>
            )}
          </For>
        </Show>
      </SettingsListV2>

      <Show when={deleting()}>
        {(target) => <DeleteDialog model={target()} onClose={() => setDeleting(undefined)} onDone={refetch} />}
      </Show>
    </div>
  )
}

function DeleteDialog(props: { model: ManagedModel; onClose: () => void; onDone: () => void }) {
  const serverSDK = useServerSDK()
  const client = () => createModelRegistryClient(serverSDK().url, serverSDK().server.http)
  const [references, { refetch: reloadReferences }] = createResource<ModelReference[]>(() =>
    client().references(props.model.key),
  )
  const [replacement, setReplacement] = createSignal("")
  const [candidates] = createResource(() => client().list())
  const [busy, setBusy] = createSignal(false)

  const confirm = async () => {
    setBusy(true)
    try {
      await client().remove(props.model.key, replacement() || undefined)
      props.onDone()
      props.onClose()
    } catch (error) {
      const code = (error as RegistryError)?.code
      const message = error instanceof Error ? error.message : String(error)
      showToast({ title: "删除失败", description: code ? `[${code}] ${message}` : message })
      if (code === "MODEL_IN_USE") await reloadReferences()
    } finally {
      setBusy(false)
    }
  }

  const referenceLabel = (reference: ModelReference) =>
    reference.kind === "default" ? "默认聊天模型" : `智能体「${reference.agent ?? "未命名"}」`

  return (
    <div class="settings-v2-model-registry-delete" role="alertdialog" aria-label="删除模型">
      <SettingsListV2>
        <SettingsRowV2
          title={`删除 ${props.model.displayName}？`}
          description={
            props.model.source === "discovered"
              ? "自动发现的模型无法物理删除，将改为隐藏，Provider 刷新后不会重新显示。"
              : props.model.source === "builtin"
                ? "内置模型不能删除，请通过上方开关禁用。"
                : "删除后将从注册表与本地持久化中彻底移除，重启不会恢复。"
          }
        >
          <Show when={references.latest?.length} fallback={<span>当前没有配置引用该模型。</span>}>
            <div>
              <p>该模型正在被以下配置使用：</p>
              <ul>
                <For each={references.latest ?? []}>{(reference) => <li>{referenceLabel(reference)}</li>}</For>
              </ul>
              <p>删除后这些配置需要重新选择模型。</p>
            </div>
          </Show>
        </SettingsRowV2>
        <Show when={references.latest?.length}>
          <SettingsRowV2 title="替换为" description="将上述引用迁移到所选模型">
            <select
              class="settings-v2-model-registry-select"
              value={replacement()}
              onChange={(event) => setReplacement(event.currentTarget.value)}
            >
              <option value="">（不替换，阻止删除）</option>
              <For each={(candidates.latest?.models ?? []).filter((item) => item.key !== props.model.key)}>
                {(item) => (
                  <option value={item.key}>
                    {item.displayName}（{item.providerId}/{item.modelId}）
                  </option>
                )}
              </For>
            </select>
          </SettingsRowV2>
        </Show>
        <SettingsRowV2 title="" description="">
          <div class="settings-v2-model-registry-actions">
            <Button variant="primary" size="small" disabled={busy()} onClick={() => void confirm()}>
              确认删除
            </Button>
            <Button variant="secondary" size="small" disabled={busy()} onClick={props.onClose}>
              取消
            </Button>
          </div>
        </SettingsRowV2>
      </SettingsListV2>
    </div>
  )
}

