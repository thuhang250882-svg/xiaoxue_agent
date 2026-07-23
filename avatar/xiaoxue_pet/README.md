# 小雪桌面宠物

录井小雪桌面宠物系统（Xiaoxue Desktop Pet）。

## 架构

```
packages/app/src/components/xiaoxue/pet/
├── index.ts                 # 模块入口
├── state.ts                 # 动画状态类型、视觉映射、菜单配置
├── PetEventBridge.ts        # Agent状态事件桥接
├── usePetState.ts           # 响应式状态 composable
├── ParticleCanvas.tsx        # Canvas 粒子特效
├── XiaoxuePetOverlay.tsx    # 浮动宠物组件
└── animations.ts            # CSS 动画定义
```

## 状态映射

| 系统状态 | 动作 | 粒子颜色 | 效果 |
|---------|------|---------|------|
| idle | 等待任务 | #60a5fa | 呼吸浮动 |
| listen | 倾听需求 | #a78bfa | 头部倾斜 |
| thinking | 整理判断 | #f59e0b | 脉冲发光 |
| searching | 检索资料 | #06b6d4 | 左右扫描 |
| reading | 读取资料 | #8b5cf6 | 轻微上下 |
| writing | 撰写材料 | #10b981 | 打字动作 |
| reviewing | 执行审核 | #f97316 | 聚焦放大 |
| success | 任务完成 | #22c55e | 完成反馈 |
| celebrate | 庆祝成果 | #f59e0b | 庆祝动画 |
| warning | 需要确认 | #eab308 | 警告抖动 |
| error | 处理失败 | #ef4444 | 暗淡呼吸 |

## 事件驱动

状态由智能体执行事件驱动：`agent_state_changed`。

事件桥接流程：
1. 智能体执行任务，通过工具元数据发出状态事件
2. `message-timeline.tsx` 检测到状态变化，触发 DOM CustomEvent
3. `PetEventBridge` 监听事件，更新响应式状态
4. `XiaoxuePetOverlay` 根据状态更新视觉效果

## 配置文件

`configs/xiaoxue_pet.yaml` — 桌面宠物完整配置（状态、动画、菜单）。

## 3D 模型（未来扩展）

当前使用 `logo-xiaoxue.png` 作为 2.5D 形象。预留在 `xiaoxue_pet.yaml` 中
配置 Three.js GLB 模型加载的能力。
