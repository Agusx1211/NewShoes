# TEAM.md

This file records model families used by the local orchestration workflow.
Availability, endpoints, concurrency, and machine placement are installation
details and must stay in local configuration, not in this repository.

Before delegating, query the live model roster and choose the smallest capable
model for the task. The historical port used these families:

| Family | Typical role |
|---|---|
| OpenAI GPT-5 Codex | implementation, integration, and verification |
| Anthropic Claude Fable 5 | architecture, browser runtime, and integration |
| Anthropic Claude Opus 4.8 | rendering and fidelity investigation |
| Z.ai GLM-5.2 | broad implementation and orchestration |
| Qwen 3.6 variants | focused scouting, implementation, and review |
| Mistral Medium 3.5 | focused implementation and review |
| DeepSeek V4 Pro | focused implementation |

Do not commit hostnames, addresses, API routes, credentials, metering details,
or private machine constraints here. Keep those in the orchestration tool's
local configuration.
