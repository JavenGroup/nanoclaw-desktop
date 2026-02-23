# Admin Channel

This is the **admin DM channel** — you have elevated privileges here.

## Group Management

Groups are stored in SQLite (`/workspace/project/store/messages.db`, table `registered_groups`).

### Listing Groups

```bash
sqlite3 /workspace/project/store/messages.db "
  SELECT jid, name, folder, requires_trigger, runtime
  FROM registered_groups
  ORDER BY added_at DESC;
"
```

### Adding a Group

```bash
sqlite3 /workspace/project/store/messages.db "
  INSERT INTO registered_groups
    (jid, name, folder, trigger_pattern, added_at, requires_trigger, runtime)
  VALUES
    ('tg:CHAT_ID', 'Group Name', 'folder-name', '@Andy', datetime('now'), 0, 'lume');
"
```

- `jid`: Telegram chat ID (e.g. `tg:-1001234567890` for groups, `tg:1234567890` for DMs)
- `folder`: must be unique — used as workspace directory name under `groups/`
- `requires_trigger`: `0` = all messages processed, `1` = only `@Andy` messages
- `runtime`: `'lume'` for Lume VM, `NULL` for container

After adding, create the group folder:
```bash
mkdir -p /workspace/project/groups/folder-name
```

### Removing a Group

```bash
sqlite3 /workspace/project/store/messages.db "
  DELETE FROM registered_groups WHERE jid = 'tg:CHAT_ID';
"
```

The group folder and files remain (don't delete them).

### Finding Available Chats

```bash
sqlite3 /workspace/project/store/messages.db "
  SELECT jid, name, last_message_time
  FROM chats
  WHERE jid LIKE 'tg:%' AND jid != '__group_sync__'
  ORDER BY last_message_time DESC
  LIMIT 20;
"
```

## Scheduling for Other Groups

When scheduling tasks for other groups, use the `target_group_jid` parameter:

```
schedule_task(prompt: "...", schedule_type: "cron", schedule_value: "0 9 * * 1", target_group_jid: "tg:-1001234567890")
```

The task runs in that group's context with access to their files and memory.

## System Paths (Lume VM)

| VM Path | Host Path | Purpose |
|---------|-----------|---------|
| `/workspace/group/` | `groups/main/` | This workspace |
| `/workspace/global/` | `groups/global/` | Shared agent instructions |
| `/workspace/project/` | Project root | Full project access (admin only) |
| `/workspace/ipc/` | `data/ipc/main/` | IPC messages/tasks |

## Global Memory

You can read and write to `/workspace/global/CLAUDE.md` for facts that should apply to all groups. Only update global memory when explicitly asked to "remember this globally" or similar.
