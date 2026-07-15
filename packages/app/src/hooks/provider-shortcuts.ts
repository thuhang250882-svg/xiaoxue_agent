export const providerShortcuts: { id: string; name: string }[] = [
  { id: "xiaomi-token-plan-cn", name: "小米 MiMo（Token Plan）" },
  { id: "kimi-for-coding", name: "Kimi For Coding" },
  { id: "moonshotai-cn", name: "Kimi / Moonshot API（中国区）" },
  { id: "deepseek", name: "DeepSeek" },
  { id: "alibaba-cn", name: "千问 Qwen（中国区）" },
]

export const popularProviders = providerShortcuts.map((x) => x.id)