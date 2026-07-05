# TEAM.md — Team A roster

This is your team. Every worker is a **pi-as-mcp sub-agent**, free to run, less
capable than you but able to work in parallel while you manage. You reach them with
`delegate` / `agent_reply` / `agent_peek` / `agent_stop` / `score`.

> This file is a starting map, not gospel. Roster and limits change — call the
> `models` tool for the live list, and edit this file to match reality.

**None of these workers can access the web.** If a task needs the internet, that's
not a job for this team.

**Four of the six are local, spread across three physical machines** (`llmbench`,
`macstudio`, `vscode11`). Your throughput goal is simple: **keep all three machines
busy most of the time.** Goliath and Mercury are the two hosted (metered) lanes.

## The team

| Call-sign | Model | Ctx | Machine | Runs |
|---|---|---|---|---|
| **Falcon** | `llmbench-llamacpp/qwen3.6-27b@iq2_m` | 58K | `llmbench` (192.168.66.102) | 1 at a time |
| **Atlas** | `macstudio/qwen3.6-27b-mtp` | 262K | `macstudio` | 1 at a time — **shares machine with Ranger** |
| **Ranger** | `macstudio/qwen/qwen3.6-35b-a3b` | 262K | `macstudio` | 1 at a time — **shares machine with Atlas** |
| **Sherpa** | `vscode11/qwen3.6-35b-a3b-mtp` | 262K | `vscode11` | 1 at a time |
| **Goliath** | `zai/glm-5.2` | 1M | hosted (z.ai) | 1 at a time — **metered, conserve** |
| **Mercury** | `mistral/mistral-medium-3.5` | 262K | hosted (Mistral API) | up to 2 — **metered, conserve** |

> ⚠️ **Not usable regardless of what the live roster claims:**
> `macstudio/minimax-2.7` may show up in `models` output but is **not available —
> never delegate to it**; the delegation is wasted. (GLM-5.2 **is** usable now, via
> the **`zai/glm-5.2`** path — that's Goliath. The old `opencode-go/glm-5.2` path is
> no longer the one we use.)

### Who they are

- **Falcon** — the **workhorse**. Very fast, **2nd-smartest** on the team. Its only
  weakness is a **small context window (58K — lowered from 67K after a VRAM OOM)**:
  it gets **micro-tasks only** —
  single-file edits, single-question verifications, ≤~15 tool calls with known
  target paths. **Never** send it exploration, repo-wide greps, or build loops:
  those overflow its window and return null, wasting the run. Within that scope
  it's your **default for small coding tasks** and quick spot-checks.
  One instance at a time on its own machine.

- **Atlas** — the **best model we have** (27B, Q8 quant, long context). Highest
  quality output, but **SLOW**. Reserve Atlas for the one track that genuinely needs
  the most intelligence or the biggest context — don't waste his cycles on trivia,
  because while he runs, Ranger can't.

- **Ranger** — a **great scout** (35B, long context) that can also **do some
  coding**. Fast-moving reconnaissance and mid-complexity work.

- ⚠️ **Atlas and Ranger live on the same `macstudio` box and fight for resources —
  never run them at the same time.** Treat `macstudio` as **one lane**: it's either
  Atlas *or* Ranger, never both.

- **Sherpa** — a **second 35B instance** (on `vscode11`) with **max context**.
  Slightly **worse and slower than Ranger**, but it's on its own machine, so it's
  free parallel capacity. Best for **long-context** scouting/coding you want running
  independently while `macstudio` is busy with Atlas or Ranger.

- **Goliath** — **the strongest model on the team, full stop.** `zai/glm-5.2`, a
  hosted frontier model on the z.ai subscription, with a **huge 1M context window**.
  This is the **heavy artillery**: reserve it for the single hardest track, the
  biggest-context job, or mission-critical review — not trivia. It's **hosted and
  metered**, so it's local-first by default; pull Goliath in when the problem genuinely
  demands top intelligence or a context no local lane can hold. One instance at a time.

- **Mercury** — the **hosted wildcard**. **Very fast**, a **mixed bag** on quality.
  It's a non-local worker and **we're already heavy on API usage**, so lean
  on the local three first and pull Mercury in when you need speed or a spare lane —
  not by default.

Rough intelligence order: **Goliath** (strongest, 1M ctx, metered) → **Atlas** (best
local, slow) → **Falcon** (fast, small ctx) → **Ranger** → **Sherpa** (35B twin, a bit
weaker/slower). **Mercury** is off to the side: fast but inconsistent, and metered.

## Keeping the machines busy

The whole point is parallelism across the three local boxes. The ideal steady state
is **three local lanes running at once**:

- **Lane 1 — `llmbench`:** Falcon on a medium coding task or a scout.
- **Lane 2 — `macstudio`:** Atlas *or* Ranger (pick one — never both).
- **Lane 3 — `vscode11`:** Sherpa on a long-context job.
- **Lane 4 — hosted (premium):** Goliath on the single hardest / biggest-context
  track, when the value justifies the metered spend.
- **Lane 5 — hosted:** Mercury only when you need a fast extra hand and the API
  budget allows.

If a machine goes idle while you have queued work, that's wasted throughput — feed
it. Prefer `agent_reply` to keep a warm worker rather than cold-spawning.

## Roles — how to staff a job

Match the role to a `tool_mode` and a call-sign. Give every worker a real brief
(objective + *why*, scouted context, conventions, acceptance criteria, out-of-scope),
and tell them to **report back information-dense, no fluff**.

- **Scout** — `tool_mode: read-only`. Maps code/conventions/integration points so
  *you* never open a file. Ranger and Sherpa are naturals (long context); Falcon
  scouts fast when the area is small enough for its window.
- **Coder** — `tool_mode: full` (needs bash to build/test), `cwd` = its **worktree**.
  Falcon for tight micro-tracks (known files, no exploration); Atlas for the single
  hardest / biggest-context track; Ranger for mid-complexity; Sherpa for a parallel
  long-context track; Mercury for a fast extra lane when the value justifies spend.
- **Reviewer** — `tool_mode: read-only`, pointed at a finished branch/worktree, in a
  **fresh session**. Returns a verdict + issue list. For a critical track, review
  with a *different* call-sign than the one that wrote it (e.g. Falcon codes → Atlas
  or Ranger reviews).
- **Integrator** — `tool_mode: full`, `cwd` = repo root. Owns the git lifecycle:
  creates worktrees/branches, **merges** reviewed branches + verifies the build. You
  never merge by hand. Use a reliable local worker (Falcon or Atlas).
- **Janitor** — `tool_mode: full`. Removes worktrees, deletes merged branches at the
  end. Any spare local lane is fine.

## Staffing heuristics

- **`macstudio` is one lane:** Atlas *xor* Ranger, never concurrent.
- **Falcon and Sherpa are independent lanes** — run them alongside `macstudio` for
  three-wide local parallelism.
- **Reserve Atlas** for the track that truly needs top quality or huge context; his
  slowness and machine-sharing make him expensive to occupy.
- **Falcon is micro-tasks only** (58K window) — single-file edits, single-question
  checks. Exploration/grep-heavy/build-loop work goes to a 262K lane.
- **The Mac GPU verification machine is a one-slot resource, not a lane** — it gates
  all visual verification. Queue only verification-final steps on it; do
  pre-verification on the dev box (SwiftShader) first. Never park a second worker
  behind it — backfill that worker from `TODO.md` instead.
- **Mercury policy:** hold it for high-value, speed-critical tasks — hosted and
  metered, local-first. Holding it idle is a stated decision, not a silent default.
- **Score** workers when they finish (1–10) so the roster's quality signal improves.
