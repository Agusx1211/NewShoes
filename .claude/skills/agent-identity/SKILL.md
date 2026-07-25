---
name: agent-identity
description: Generate and retain a deterministic Project New Shoes agent codename. Use at the start of repository tasks that may create, claim, comment on, review, or open a GitHub issue or pull request so same-model agents remain distinguishable.
---

# Agent Identity

1. Before the first GitHub write, run the generator exactly once from the
   repository root:

   ```sh
   python3 .claude/skills/agent-identity/scripts/generate_agent_codename.py
   ```

   The script uses the first available stable parent or session identifier from
   `AGENT_PARENT_ID`, `CODEX_AGENT_PARENT_ID`, or `CODEX_THREAD_ID`. If none is
   available, pass the stable parent identifier with `--parent-id`.
2. Remember the printed codename for the whole task. Do not run the generator
   again while the parent identifier is unchanged, including after context
   compaction or a resumed turn. Never publish the parent identifier.
3. End every agent-authored GitHub issue or pull-request body, comment, review,
   and related handoff note with both identities:

   ```text
   Agent-Codename: MadTank0123
   Agent-Model: OpenAI gpt-5.6-sol
   ```

   Substitute the remembered codename and exact runtime model. The codename
   supplements the required model signature; it does not replace it. Commits
   continue to require only the `Agent-Model` trailer.
