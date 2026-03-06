---
name: add-telegram-bot
description: Add an additional Telegram bot to NanoClaw Desktop. Each bot can manage its own set of groups/chats independently. Triggers on "add bot", "new telegram bot", "add telegram bot", "second bot".
---

# Add Telegram Bot

Adds a new Telegram bot to an existing NanoClaw Desktop setup that already has at least one bot configured.

**UX Note:** Use `AskUserQuestion` for interactive prompts.

## Prerequisites

- NanoClaw Desktop is already set up (`/setup-desktop` completed)
- At least one Telegram bot is already configured in `.env`
- The service is running (needed for `/chatid`)

## 1. Create the Bot

Ask the user:
> Do you already have a bot token for the new bot, or do you need to create one?

If they need to create one:
> 1. Open Telegram and message [@BotFather](https://t.me/BotFather)
> 2. Send `/newbot`
> 3. Choose a name for the bot
> 4. Choose a username (must end in `bot`)
> 5. Copy the token BotFather gives you and paste it here
>
> Also recommended:
> - Send `/setprivacy` to BotFather, select the new bot, and choose **Disable** (so it can see group messages)

Wait for the token.

Ask the user:
> What label do you want for this bot? (e.g. `Sales`, `Support`, `Andy2`)
>
> This label is used for folder naming: `{label}-dm/`, `{label}-forum/`.
> If you don't specify one, it defaults to `{ASSISTANT_NAME}N` (e.g. `Andy2`).

## 2. Add Token to .env

Read the current `.env` file. Add the new token with its label using `token:Label` format:

- If `TELEGRAM_BOT_TOKENS` exists, append: `TELEGRAM_BOT_TOKENS=existing,new_token:Label`
- If it doesn't exist, add: `TELEGRAM_BOT_TOKENS=new_token:Label`

**Important:** Do NOT modify `TELEGRAM_BOT_TOKEN` (that's the primary/default bot). The new token goes in `TELEGRAM_BOT_TOKENS`.

Example result:
```
TELEGRAM_BOT_TOKEN=existing_primary_token
TELEGRAM_BOT_TOKENS=new_token:Sales
```

If there are already extra tokens:
```
TELEGRAM_BOT_TOKENS=existing_extra:Andy2,new_token:Sales
```

Omit the `:Label` part to auto-number (Andy2, Andy3, etc.).

## 3. Restart the Service

The new bot requires a restart to connect.

```bash
# If running via launchd
launchctl unload ~/Library/LaunchAgents/com.nanoclaw-desktop.plist
npm run build
launchctl load ~/Library/LaunchAgents/com.nanoclaw-desktop.plist
```

Or if running manually, tell the user to restart `npm run dev`.

After restart, check logs for the new bot's connection:
```bash
grep -i "Telegram bot connected" logs/nanoclaw.log | tail -5
```

The log should show the new bot's username and ID. Note the **Bot ID** — it's needed for registering groups.

## 4. Register Groups Under the New Bot

Tell the user:
> Now add the new bot to your Telegram group(s) and send `/chatid` in each group.
> The bot will reply with the Chat ID **and** its own Bot ID.

Once you have the chat JID and bot ID, register channels using the bot label for folder naming.

**Folder convention:** `{label}-dm` for DM, `{label}-forum` for groups (where `label` is the bot's label lowercased).

```bash
# Register DM (admin channel for this bot — set is_admin=1 if this is the user's admin channel)
sqlite3 store/messages.db "INSERT OR REPLACE INTO registered_groups
  (jid, name, folder, trigger_pattern, added_at, requires_trigger, runtime, bot_id, is_admin)
  VALUES ('DM_CHAT_JID', 'LABEL', 'LABEL-dm', '@ASSISTANT_NAME', datetime('now'), 0, 'lume', 'BOT_ID', 0);"

# Register group
sqlite3 store/messages.db "INSERT OR REPLACE INTO registered_groups
  (jid, name, folder, trigger_pattern, added_at, requires_trigger, runtime, bot_id, is_admin)
  VALUES ('GROUP_CHAT_JID', 'LABEL', 'LABEL-forum', '@ASSISTANT_NAME', datetime('now'), TRIGGER_VALUE, 'lume', 'BOT_ID', 0);"
```

Where:
- `LABEL` — bot's label lowercased (e.g., `sales`, `andy2`)
- `CHAT_JID` — from `/chatid` (e.g., `tg:-1003766556846`)
- `ASSISTANT_NAME` — from `.env` (`ASSISTANT_NAME`)
- `TRIGGER_VALUE` — `0` if only user+bot in group, `1` if group has other people
- `BOT_ID` — the numeric bot ID from `/chatid` response or logs
- `is_admin` — `1` for admin channel (cross-group IPC, full task visibility), `0` for regular. Usually only the primary bot's DM is admin.

Create the workspace folders:
```bash
mkdir -p groups/LABEL-dm groups/LABEL-forum
```

**Important:**
- Each group belongs to exactly ONE bot — do not register the same group under multiple bots
- The `folder` column is UNIQUE — each group must have a different folder name
- The new bot will only respond to groups registered with its `bot_id`

## 5. Verify

After registration, restart the service to reload the group list.

Test by sending a message in the newly registered group:
> Send `@ASSISTANT_NAME hello` in the group managed by the new bot.

Check logs:
```bash
tail -20 logs/nanoclaw.log
```

You should see the message being received and processed by the correct bot.

## Managing Multiple Bots

### List all bots and their groups
```bash
sqlite3 store/messages.db "SELECT bot_id, jid, name, folder, is_admin FROM registered_groups WHERE jid LIKE 'tg:%' ORDER BY bot_id;"
```

### Move a group to a different bot
```bash
sqlite3 store/messages.db "UPDATE registered_groups SET bot_id = 'NEW_BOT_ID' WHERE jid = 'CHAT_JID';"
```
Then restart the service for the change to take effect.

### Remove a bot
1. Move or delete all its groups first
2. Remove its token from `TELEGRAM_BOT_TOKENS` in `.env`
3. Restart the service
