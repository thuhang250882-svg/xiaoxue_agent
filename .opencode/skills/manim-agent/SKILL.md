---
name: manim-agent
description: 使用单位已部署的本地 Manim Agent 创建、审阅、调试或打包数学和技术讲解动画。支持本地 Manim 渲染与 FFmpeg 合成；不下载仓库，不调用 DashScope、Claude、云端 TTS 或其他公网服务。
---

# Manim Agent

## 录井小雪内网边界

录井小雪的受管内网模式禁止调用本技能原有的 DashScope、Claude Agent SDK 兼容路由或公网 TTS，也不得向这些服务发送提示词、脚本、内部材料或渲染帧。只有已经配置并获单位批准的本地模型适配器才能执行生成阶段；否则可以完成环境检查、脚本审阅、手工 Manim 方案和本地渲染，并明确报告“外部模型阶段已被内网策略阻止”。配音默认使用批准的本地离线 TTS，未配置时使用 `--no-tts`。

Use this skill only with an already installed local Manim Agent repository. Locate it from `MANIM_AGENT_HOME`, the current workspace, or a user-provided path. If it is missing, report the missing local dependency; do not clone or download it.

## Operating Mode

1. Clarify the requested output only when needed: topic, target duration, audience, voice/TTS need, quality level, and final file path.
2. Run `scripts/check_manim_agent_env.py` before the first real render in a session, or whenever a failure suggests missing dependencies.
3. Prefer the CLI path for direct video delivery. Use the Web path only when the user asks for task history, SSE progress, browser UI, or backend persistence.
4. Preserve the repository pipeline: planning, implementation, render resolution/review, narration, TTS, and mux. Do not replace it with a handmade `scene.py` unless the user explicitly asks for a raw Manim scene.
5. Produce concrete artifacts: final MP4, generated scene/code location, logs or error summary, and the command used.

## Required Interfaces

- A working local runtime is required before generation: Python 3.12+, `uv`, Manim and FFmpeg. Run `scripts/check_manim_agent_env.py` instead of guessing.
- Model-assisted planning may use only a unit-approved local model adapter. If none is configured, produce a manual scene plan and local Manim code or report the blocked phase.
- TTS is optional and must be local/offline. When no approved local TTS exists, use `--no-tts`.
- Do not request API keys, download returned audio, or call public model endpoints.
- Database and R2 credentials are not required for direct CLI MP4 generation; they are only needed for the Web/backend persistence path.

## Reference Routing

- Read `references/repo-runtime.md` for installation, environment variables, CLI/Web commands, ports, and local paths.
- Read `references/pipeline-workflow.md` before running or explaining the end-to-end pipeline.
- Read `references/production-quality.md` before generating or reviewing teaching animation content.
- Read `references/recovery-and-review.md` when a render, structured output, TTS, mux, or frontend/backend task fails.

## Default CLI Pattern

From the local `manim-agent` repository:

```powershell
uv run python -m manim_agent "解释傅里叶变换的核心直觉" --target-duration 30 --quality high --no-tts -o outputs/fourier.mp4
```

Use `--no-tts` for the first smoke run unless the user explicitly wants narration and a supported TTS key is available. For production narration:

```powershell
uv run python -m manim_agent "证明勾股定理" --target-duration 30 --quality high --voice longanyang -o outputs/pythagorean.mp4
```

Default runs do not enable independent AI frame review. Add `--render-review` only when the user asks for strict visual review, release QA, frame-by-frame inspection, or when a previous render showed overlap, cropping, unreadable math, or other visual risk:

```powershell
uv run python -m manim_agent "证明勾股定理" --target-duration 30 --quality high --voice longanyang --render-review -o outputs/pythagorean_reviewed.mp4
```

## Delivery Rules

- State whether the run used no-TTS, TTS, render review, intro/outro, full render, or segment render.
- Never claim the video is ready until the MP4 path exists and is readable.
- If a dependency is missing, report the exact missing dependency and the next command to fix it.
- If a secret is provided in chat, use it only for the current run when necessary; do not write it into this skill, logs, examples, or user-visible output.
- If the user asks for a packaged skill or reusable workflow, update this skill rather than scattering notes into the repository.
- Do not expose API keys, database URLs, R2 credentials, or `.env` values in responses.

## Local Repo Awareness

The upstream repo already contains a production plugin at `plugins/manim-production/` with scene planning, scene building, layout safety, narration sync, render review, and intro/outro rules. Reuse those rules when working inside the repo. This Codex skill is the stable outer entrypoint: it decides when to invoke the repo, which path to run, what checks to perform, and what evidence to return.
