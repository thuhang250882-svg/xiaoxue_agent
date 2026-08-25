# Xiaoxue RC release profile — 2026-08-25

## Fixed two-layer model

- `PLATFORM_EFFECTIVE_SKILLS = 69`
- `XIAOXUE_RC_SKILLS = 11`
- Release policy: `FILTER_WITHOUT_PHYSICAL_DELETION`
- Machine-readable source: `configs/xiaoxue/rc-release-profile.json`

The platform catalog remains intact. The RC installer uses a staging allowlist and an RC-specific integrity manifest; it does not archive or delete platform-only Skills.

## RC_L0_ENTRIES (8)

| Skill | Core path |
| --- | --- |
| `office-assistant` | Office documents, long-document continuation, meeting minutes, naturalization |
| `geolog-logging-review` | Geology and mud-logging report review |
| `mud-logging-report-generation` | Report generation and export workflow |
| `geology-knowledge` | Enterprise geology knowledge retrieval |
| `tender-document-review` | Tender and bid compliance review |
| `tender-bid-generation` | Evidence-grounded bid response generation |
| `审查合同` | Contract review |
| `起草合同` | Contract drafting |

## RC_INTERNAL_DEPENDENCIES (1)

- `石油行业合同知识库` — shared industry parameters and contract knowledge for review and drafting.

## RC_FOUNDATIONS (2)

- `document-review-tracked` — tracked-change document review and formal revision workflow.
- `llm-wiki-knowledge` — knowledge compilation, update, and health-check workflow.

Ordinary chat uses `xiaoxue-agent-runtime`. Skill Center basics use the built-in `customize-opencode` and `skill-center-runtime`; these are runtime foundations, not separately packaged repository Skills.

## RC_OPTIONAL (14, not in this installer)

`darwin-skill`, `skill-criticagent`, `markitdown-skill`, `pdfkit-py`, `tencentcloud-ocr`, `minimax-docx`, `minimax-xlsx`, `pptx-generator`, `wpscli`, `material-organizer`, `tender-management`, `tencent-esign-contract`, `tencent-meeting-skill`, `openai-whisper-api`.

These remain available to the platform and can enter a later profile after their external-service, dependency, or business-path gates are closed.

## PLATFORM_ONLY (44)

The complete list is recorded in the machine-readable profile. In particular, `autoresearch`, `image-well`, and `nano-banana-pro` remain present in the 69-Skill platform catalog and are explicitly excluded from the RC installer.

The former `long-document-writing`, `meeting-minutes-manager`, and `humanizer` names are not counted in any tier because their knowledge is now internal to `office-assistant`.

## Packaging contract

1. Run `bun run rc:skills` from `packages/desktop`.
2. The materializer reads only files tracked by the selected Git revision and writes exactly 11 Skill roots to `packages/desktop/resources/staging/skills`.
3. It writes an RC-specific `resources/staging/integrity.json` covering the staged Skills and bundled Obsidian plugin.
4. Build with `XIAOXUE_RELEASE_PROFILE=rc`; Electron Builder packages the staging Skill directory and maps the RC integrity manifest to `app.asar/resources/integrity.json`.
5. Platform/dev builds retain the full `.opencode/skills` source and existing platform integrity manifest.

## Core-path evidence

- Bid generation, bid review, and procurement-side tender authoring have mutually exclusive router rules.
- `tender-bid-generation` uses the existing Skill workflow; no nonexistent generation Tool is declared.
- Contract review and drafting both retain access to the petroleum-industry contract knowledge dependency.
- RC profile tests assert the full 69-item partition, 11-item installer set, protected platform capabilities, eight core paths, and Electron Builder filter selection.
