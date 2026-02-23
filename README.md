<h1 align="center">NanoClaw Desktop</h1>

<p align="center">
  <strong>macOS only</strong> — Personal Claude assistant running on a real macOS desktop VM, with anti-detection browser, multi-project isolation, and Telegram control.<br>
  Requires Apple Silicon Mac. "Desktop" = macOS desktop inside a <a href="https://github.com/trycua/cua">Lume</a> VM, not a Windows/Linux GUI app.<br>
  Forked from <a href="https://github.com/qwibitai/nanoclaw">qwibitai/nanoclaw</a> at commit <code>acdc645</code>.
</p>

## Why NanoClaw Desktop

### 1. Real macOS Desktop, Not a Headless Container

Most agent frameworks run in headless Linux containers — no GUI, no real browser, easily detected by anti-bot systems. NanoClaw Desktop runs agents inside a **real macOS VM** ([Lume](https://github.com/trycua/cua)) with a full desktop environment. The agent can:

- **See and interact with a GUI** — click, scroll, type, just like a human
- **Use an anti-detection browser** — [Patchright](https://github.com/nicetransition/patchright) (Chromium fork) that passes bot detection on sites like Xiaohongshu, Douyin, etc.
- **Run desktop apps** — anything that runs on macOS is available to the agent

This is why it's called "Desktop" — the agent lives on a real desktop, not in a black box.

### 2. Full Claude Code Power, Not a Toy Agent Framework

Other projects (e.g. [OpenClaw](https://github.com/openclaw/openclaw)) build their own agent frameworks — custom tool calling, custom memory, custom planning. Inevitably limited.

NanoClaw takes a different approach: **the agent IS [Claude Code](https://claude.ai/download)** — Anthropic's official CLI agent. This means:

- Every Claude Code tool out of the box: `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `WebSearch`, `WebFetch`, `Task`, `Agent Teams`...
- Session management, context compaction, multi-turn — all built in
- MCP server extensibility
- **Future Claude Code capabilities arrive automatically** — zero effort to upgrade

NanoClaw doesn't build an agent. It orchestrates the best one available.

### 3. Simple Architecture, Not a Framework

One Node.js process. ~10 source files. SQLite + filesystem IPC. You can read the entire codebase in minutes.

Compare with OpenClaw: 52+ modules, 8 config management files, 45+ dependencies, abstractions for 15 channel providers.

NanoClaw is small enough that you — or Claude Code itself — can safely modify it to match your exact needs.

## Architecture

```
Telegram DM (admin)          Telegram Group (projects)
  │  all messages               ├── Topic A (Project Alpha)
  │  processed                  ├── Topic B (Project Beta)
  │                             └── General
  │                                    │
  └────────────┬───────────────────────┘
               ▼
┌───────────────────────────────────┐
│  NanoClaw Desktop (Node.js)       │
│                                   │
│  Telegram ──→ SQLite ──→ Message  │
│  Channel      store      Loop    │
│                            │      │
│                    ┌───────┴───┐  │
│                    │GroupQueue  │  │
│                    │concurrency │  │
│                    │+ IPC pipe  │  │
│                    └───┬───┬──┘  │
│                        │   │     │
│              ┌─────────┘   └──┐  │
│              │                │  │
│        ┌─────┴─────┐  ┌──────┴┐ │
│        │ Scheduler  │  │ IPC   │ │
│        │ (cron/once)│  │Watcher│ │
│        └────────────┘  └───────┘ │
└──────────────┬────────────────────┘
               │ SSH
      ┌────────┴────────┐
      │ Lume macOS VM   │
      │ (real desktop)  │
      │                 │
      │ agent-runner    │
      │ ├─ Claude Code (Agent SDK)
      │ ├─ MCP Server (nanoclaw tools)
      │ └─ patchright-browser
      └─────────────────┘
```

## Features

- **Lume macOS VM** — GUI desktop with anti-detection Patchright browser via SSH + VirtioFS
- **Two-channel Telegram** — DM for admin control (all messages processed), Group for projects (trigger-based or open)
- **Topic-based project isolation** — each Telegram Forum Topic auto-creates its own workspace, session, and IPC channel
- **Three-layer memory** — `global/CLAUDE.md` (persona, shared by all) → `main/CLAUDE.md` (admin privileges) / `{topic}/CLAUDE.md` (project memory)
- **Scheduled tasks** — cron, interval, or one-time jobs that run Claude and message you back
- **Active agent piping** — send follow-up messages mid-conversation without re-triggering

### Memory Hierarchy

```
groups/
  global/CLAUDE.md             # Persona + universal capabilities (loaded by ALL sessions)
  main/CLAUDE.md               # DM admin instructions (group management, cross-group scheduling)
  projects/CLAUDE.md           # Group general topic workspace
  projects~t16/                # Topic 16 (auto-created on first message)
    ├── CLAUDE.md              # Project memory (auto-loaded by Claude Code)
    ├── research/              # Project files
    └── logs/
```

### Per-Topic Isolation

```
data/
  ipc/
    projects~t16/              # Topic 16 IPC (isolated)
      ├── messages/            #   agent → host (send Telegram messages)
      ├── tasks/               #   agent → host (schedule tasks)
      └── input/               #   host → agent (pipe user messages)
  sessions/
    projects~t16/
      └── .claude/             # Claude Code session persistence
```

Each topic = independent project. No manual registration — derived automatically from the chat JID (`{baseFolder}~t{topicId}`).

## Quick Start

```bash
git clone https://github.com/JavenGroup/nanoclaw-desktop.git
cd nanoclaw-desktop
claude
```

Then run `/setup-desktop`. Claude Code handles Lume VM, Telegram bot, authentication, and runtime configuration.

## Requirements

- **macOS on Apple Silicon** (M1/M2/M3/M4) — Lume VM requires Apple's Virtualization.framework, macOS-only. Other platforms may work with Docker/container runtime but are untested.
- Node.js 20+
- [Claude Code](https://claude.ai/download)
- [Lume](https://github.com/trycua/cua) (macOS VM runtime)

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/telegram.ts` | Telegram bot connection, send/receive, topic routing |
| `src/lume-runner.ts` | Lume macOS VM agent runner (SSH + VirtioFS) |
| `src/container-runner.ts` | Apple Container / Docker agent runner |
| `src/group-queue.ts` | Per-group queue with concurrency control + IPC pipe |
| `src/ipc.ts` | IPC watcher: messages, photos, task scheduling |
| `src/task-scheduler.ts` | Cron/interval/once scheduled task execution |
| `src/types.ts` | Topic isolation helpers (`getEffectiveFolder`, `getBaseFolder`) |
| `src/db.ts` | SQLite operations (messages, groups, sessions, tasks) |
| `container/agent-runner/` | Agent code that runs inside VM/container |
| `groups/global/CLAUDE.md` | Persona + universal capabilities (loaded by all sessions) |
| `groups/main/CLAUDE.md` | DM admin privileges (group management, cross-group scheduling) |
| `groups/*/CLAUDE.md` | Per-project memory (auto-loaded by Claude Code via cwd) |

## Fork Status

| | |
|---|---|
| **Upstream** | [qwibitai/nanoclaw](https://github.com/qwibitai/nanoclaw) @ `acdc645` (75 commits behind) |
| **Strategy** | Rebase onto upstream once it reaches a stable release. No merge until then. |

## License

MIT
