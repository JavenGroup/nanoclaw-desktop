<h1 align="center">NanoClaw Desktop</h1>

<p align="center">
  Personal Claude assistant running on a real macOS desktop — with anti-detection browser, multi-project isolation, and Telegram control.<br>
  Forked from <a href="https://github.com/qwibitai/nanoclaw">qwibitai/nanoclaw</a> at commit <code>acdc645</code>.
</p>

## Fork Status

| | |
|---|---|
| **Upstream** | [qwibitai/nanoclaw](https://github.com/qwibitai/nanoclaw) @ `acdc645` (75 commits behind) |
| **Strategy** | Rebase onto upstream once it reaches a stable release. No merge until then. |

## What's Different in This Fork

### Telegram-First Channel
Replaced WhatsApp (Baileys) with **Telegram** (Grammy) as the primary channel. Full bot API integration with send/receive, photo delivery, and typing indicators. WhatsApp support is preserved but optional.

### Topic-Based Project Isolation
Each **Telegram Forum Topic** within a group automatically becomes an independent project with its own:
- Workspace directory (`groups/{folder}~t{topicId}/`)
- Claude Code session (persistent conversation context)
- IPC channel (isolated message/task routing)
- Project memory (`CLAUDE.md` auto-loaded per workspace)

No manual registration per topic — derived automatically from the chat JID on first message.

### Lume macOS VM Runtime
Added [Lume](https://github.com/trycua/cua) as an alternative runtime alongside Apple Container. Runs Claude Code agents inside a macOS VM with:
- GUI desktop (for headed browser automation)
- [Patchright](https://github.com/nicetransition/patchright) anti-detection browser (Chromium fork that bypasses bot detection)
- Shared filesystem via VirtioFS (`/Volumes/My Shared Files`)

### Runtime-Aware Task Scheduler
Scheduled tasks now select the correct runtime (Lume vs Container) based on the group's configuration, instead of hardcoding container mode.

### Active Container Message Piping
When an agent is already running (e.g. during a scheduled task), user messages are piped directly to it via IPC — bypassing the trigger word check. This enables natural back-and-forth conversation with a running agent.

## Architecture

```
Telegram Group
  ├── Topic A (Project Alpha)
  ├── Topic B (Project Beta)
  └── General
         │
         ▼
┌──────────────────────────────────┐
│  NanoClaw Desktop (Node.js process)│
│                                  │
│  Telegram ──→ SQLite ──→ Message │
│  Channel      store      Loop    │
│                            │     │
│                    ┌───────┴───┐ │
│                    │GroupQueue │ │
│                    │concurrency│ │
│                    │+ IPC pipe │ │
│                    └───┬───┬──┘ │
│                        │   │    │
│              ┌─────────┘   └──┐ │
│              │                │ │
│        ┌─────┴─────┐  ┌──────┴┐│
│        │ Scheduler  │  │ IPC   ││
│        │ (cron/once)│  │Watcher││
│        └────────────┘  └───────┘│
└──────────────┬───────────────────┘
               │
      ┌────────┴────────┐
      │ Lume macOS VM   │    or    Apple Container / Docker
      │ (SSH + VirtioFS)│          (volume mounts)
      │                 │
      │ agent-runner    │
      │ ├─ Claude Agent SDK (query loop)
      │ ├─ MCP Server (nanoclaw tools)
      │ └─ patchright-browser
      └─────────────────┘
```

### Message Lifecycle

```
1. User sends "@trigger message" in a Topic
2. Telegram Channel stores message in SQLite
3. Message Loop detects new messages via polling
4. If agent already active → pipe via IPC (no new process)
   If no agent active   → check trigger → start new agent
5. Compute effective folder: group.folder + topicId → "workspace~t16"
6. Launch agent-runner in Lume VM (or Container)
   - Symlinks workspace, IPC, sessions to topic-specific dirs
   - Loads global/CLAUDE.md + project CLAUDE.md
7. Agent processes message, streams results back
8. Agent enters wait loop for follow-up messages (IPC polling)
9. Idle timeout (no messages) → agent exits gracefully
10. Next trigger message resumes the same session
```

### Per-Topic Isolation

```
groups/
  global/                    # Shared across all agents (global CLAUDE.md)
  my-workspace/              # General topic workspace
  my-workspace~t16/          # Topic 16 (auto-created on first message)
    ├── CLAUDE.md            # Project memory (auto-loaded)
    ├── research/            # Project files
    └── logs/

data/
  ipc/
    my-workspace~t16/        # Topic 16 IPC (isolated)
      ├── messages/          #   agent → host (send Telegram messages)
      ├── tasks/             #   agent → host (schedule tasks)
      └── input/             #   host → agent (pipe user messages)
  sessions/
    my-workspace~t16/
      └── .claude/           # Claude Code session persistence
```

The `~t` separator convention: `{baseFolder}~t{topicId}`. General topic (no thread ID) uses the base folder unchanged — fully backward compatible.

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
| `groups/global/CLAUDE.md` | Global agent instructions (shared) |
| `groups/*/CLAUDE.md` | Per-project agent memory (auto-loaded) |

## Quick Start

```bash
git clone https://github.com/JavenGroup/nanoclaw.git
cd nanoclaw
claude
```

Then run `/setup`. Claude Code handles dependencies, authentication, and runtime configuration.

## Requirements

- macOS (Apple Silicon recommended)
- Node.js 20+
- [Claude Code](https://claude.ai/download)
- [Lume](https://github.com/trycua/cua) (macOS VM runtime) or [Apple Container](https://github.com/apple/container) or [Docker](https://docker.com/products/docker-desktop)

## Philosophy

Inherited from upstream — **small enough to understand, secure by isolation, built for one user, AI-native**. See the [upstream README](https://github.com/qwibitai/nanoclaw) for the full philosophy.

This fork adds: **one group, many projects** — use Telegram Forum Topics to isolate different workstreams without managing multiple groups or registrations.

## License

MIT
