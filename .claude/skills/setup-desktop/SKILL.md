---
name: setup-desktop
description: Set up NanoClaw Desktop with Lume macOS VM, Telegram bot, and Claude authentication. Use this for first-time installation on macOS with the Desktop (Lume) runtime. Triggers on "setup desktop", "setup lume", "install desktop".
---

# NanoClaw Desktop Setup

Run all commands automatically. Only pause when user action is required (Telegram bot creation, configuration choices).

**UX Note:** When asking the user questions, prefer using the `AskUserQuestion` tool instead of just outputting text.

## Known Pitfalls — READ BEFORE STARTING

These are real issues encountered during setup. Follow this guidance to avoid them:

1. **Lume CLI syntax**: Uses positional args, NOT `--name`. Correct: `lume run my-vm`, `lume get my-vm`. Wrong: `lume run --name my-vm`. No `--display` flag exists (display is on by default, use `--no-display` to disable).

2. **VM requires manual setup**: After `lume create` + `lume run`, a macOS Setup Assistant appears in the VM window. The user MUST manually complete it. **Explicitly tell them** to create user `lume` / password `lume` and enable Remote Login. Many users assume this is automatic — it is NOT.

3. **SSH won't work until Remote Login is enabled**: Port 22 is closed by default. User must go to System Settings → General → Sharing → Remote Login inside the VM. Do NOT attempt SSH until user confirms this.

4. **VM user has no sudo/admin**: Homebrew install will fail. Use Node.js prebuilt binary (`~/local/bin`) instead of `brew install node`.

5. **SSH non-login shell misses PATH**: `~/.zshrc` is not sourced in SSH commands. The lume-runner already prepends `$HOME/local/bin` to PATH, but verify Node.js is reachable: `ssh lume@IP '$HOME/local/bin/node --version'`.

6. **`lume get` reports wrong status**: May show "stopped" and IP as null/`-` even when VM is running. Always test SSH directly rather than trusting `lume get` status. Set `LUME_VM_IP` in `.env` as a reliable fallback.

7. **`ensureLumeVmRunning` causes VNC popups**: If it tries to start a VM that's already running, it spawns a conflicting instance. The code now checks SSH first. If VNC popups appear, it means the SSH-first check is not working.

8. **launchd doesn't load `.env`**: The plist MUST include `--env-file=.env` in ProgramArguments. Without it, `LUME_VM_NAME`, `LUME_VM_IP`, `TELEGRAM_BOT_TOKEN` etc. will all be missing.

9. **agent-runner must be built**: `container/agent-runner/dist/` doesn't exist by default. Run `npm install && npx tsc` inside `container/agent-runner/` before first use.

10. **Telegram bot privacy**: Bots in groups can only see `/commands` by default. User must either disable privacy via BotFather (`/setprivacy` → Disable) or make bot a group admin. Tell them BEFORE testing.

11. **Three files need the assistant name**: When changing from "Andy" to a custom name, update ALL of: `src/config.ts`, `groups/global/CLAUDE.md`, `groups/main/CLAUDE.md`. Missing any one causes the bot to introduce itself with the wrong name.

12. **Bot must be running for `/chatid`**: The bot only responds to `/chatid` when NanoClaw is running. Build and start it (`npx tsx --env-file=.env src/index.ts`) BEFORE asking the user to send `/chatid`.

13. **VM name mismatch**: Three places can disagree on VM name: `lume create` defaults to `default`, user may have an existing VM with a different name (e.g. `my-vm`), and code defaults `LUME_VM_NAME` to `nanoclaw-vm`. After identifying the actual VM name (via `lume ls`), MUST set `LUME_VM_NAME=actual-name` in `.env`. Use the actual VM name consistently in all `lume` commands throughout setup.

---

## 1. Install Dependencies

```bash
npm install
```

## 2. Configure Claude Authentication

Ask the user:
> Do you want to use your **Claude subscription** (Pro/Max) or an **Anthropic API key**?

### Option 1: Claude Subscription (Recommended)

Tell the user:
> Open another terminal window and run:
> ```
> claude setup-token
> ```
> A browser window will open for you to log in. Once authenticated, the token will be displayed in your terminal. Either:
> 1. Paste it here and I'll add it to `.env` for you, or
> 2. Add it to `.env` yourself as `CLAUDE_CODE_OAUTH_TOKEN=<your-token>`

If they give you the token, write it to `.env` using the Write tool. **Never echo the full token in commands or output.**

### Option 2: API Key

Ask if they have an existing key or need to create one at https://console.anthropic.com/

Write to `.env`:
```
ANTHROPIC_API_KEY=<their-key>
```

## 3. Install and Configure Lume VM

### 3a. Check if Lume is installed

```bash
which lume && lume --version || echo "Lume not installed"
```

If not installed, tell the user:
> NanoClaw Desktop uses [Lume](https://github.com/trycua/cua) to run agents in a macOS VM with a real desktop.
>
> Install Lume:
> ```
> brew install trycua/cua/lume
> ```
>
> Let me know when it's installed.

Wait for confirmation, then verify:
```bash
lume --version
```

### 3b. Create and start the VM

Check if a VM already exists:
```bash
lume ls 2>/dev/null
```

If no VM exists, create one:
```bash
lume create default --os macos
```

This downloads a macOS restore image and creates the VM. It takes a while (several GB download).

Start the VM (display is on by default):
```bash
lume run VM_NAME --shared-dir PROJECT_ROOT
```

**Important:** Lume CLI uses positional arguments, NOT `--name`:
- Correct: `lume run my-vm`, `lume get my-vm`
- Wrong: `lume run --name my-vm`, `lume get --name my-vm`
- Display is on by default. There is no `--display` flag, only `--no-display`.

Run this with `run_in_background: true`. The VM will take 1-2 minutes to boot.

### 3c. Manual macOS Setup (IMPORTANT — requires user action)

**The VM requires manual setup through its display window.** This is NOT automatic. Tell the user:

> A macOS VM window should have appeared on your screen. You need to complete the initial setup manually:
>
> 1. **Complete the macOS Setup Assistant** — click through language, region, accessibility, etc.
> 2. **Create a user account** with these credentials:
>    - Username: **lume**
>    - Password: **lume**
>    - (These match what NanoClaw expects for SSH access)
> 3. **After reaching the desktop**, go to **System Settings → General → Sharing**
> 4. **Enable "Remote Login"** (this enables SSH so NanoClaw can connect to the VM)
>
> Let me know when you've completed all 4 steps.

**Wait for user confirmation before proceeding.** Do not attempt SSH until the user confirms.

### 3d. Get the VM IP and set up SSH key access

```bash
lume get VM_NAME --format json
```

Extract the IP address from the JSON output (`ipAddress` field).

**Note:** `lume get` may report status as "stopped" even when the VM is running. If `ipAddress` is null, try the table format or test SSH directly to `192.168.64.x` subnet.

Test SSH with password first:
```bash
sshpass -p "lume" ssh -o StrictHostKeyChecking=no lume@VM_IP echo "SSH OK"
```

If `sshpass` is not installed:
```bash
brew install hudochenkov/sshpass/sshpass
```

Then set up key-based SSH (so NanoClaw can connect without a password):
```bash
# Generate SSH key if none exists
ls ~/.ssh/id_*.pub 2>/dev/null || ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N "" -q

# Copy key to VM
sshpass -p "lume" ssh-copy-id -o StrictHostKeyChecking=no lume@VM_IP
```

Verify passwordless SSH:
```bash
ssh -o StrictHostKeyChecking=no lume@VM_IP echo "SSH OK"
```

### 3e. Install Node.js inside the VM

The VM user may not have admin/sudo privileges, so use a prebuilt binary instead of Homebrew:

```bash
ssh lume@VM_IP 'bash -s' << 'SETUP'
curl -fsSL https://nodejs.org/dist/v22.14.0/node-v22.14.0-darwin-arm64.tar.xz -o /tmp/node.tar.xz
mkdir -p ~/local
tar -xJf /tmp/node.tar.xz -C ~/local --strip-components=1
echo 'export PATH="$HOME/local/bin:$PATH"' >> ~/.zshrc
export PATH="$HOME/local/bin:$PATH"
node --version && npm --version && echo "Node installed successfully"
SETUP
```

### 3f. Build the agent-runner

The agent-runner must be compiled before the VM can use it:

```bash
cd PROJECT_ROOT/container/agent-runner && npm install && npx tsc
cd PROJECT_ROOT
```

Verify:
```bash
ls container/agent-runner/dist/index.js
```

### 3g. Configure shared directory and verify

Lume VMs use VirtioFS for host-VM file sharing (passed via `--shared-dir` when starting the VM). The NanoClaw data directories must exist:

```bash
# Ensure data directories exist
mkdir -p data/ipc data/sessions
mkdir -p groups/global groups/main
```

Verify from inside the VM:
```bash
ssh lume@VM_IP ls "/Volumes/My Shared Files/"
```

The project root contents should be visible.

### 3h. Add VM config to .env

Add the VM name and IP to `.env` so NanoClaw can find it:

```
LUME_VM_NAME=VM_NAME
LUME_VM_IP=VM_IP
```

The `LUME_VM_IP` is a reliable fallback — `lume get` sometimes reports incorrect status/IP.

## 4. Set Up Telegram Bot

### 4a. Create a bot

Tell the user:
> You need a Telegram bot. If you already have one, give me the token. Otherwise:
>
> 1. Open Telegram and message [@BotFather](https://t.me/BotFather)
> 2. Send `/newbot`
> 3. Choose a name (e.g. "My Assistant")
> 4. Choose a username (must end in `bot`, e.g. `my_assistant_bot`)
> 5. Copy the token BotFather gives you and paste it here

Once you have the token, add to `.env`:
```
TELEGRAM_BOT_TOKEN=<token>
TELEGRAM_ONLY=true
```

### 4b. Disable bot privacy mode

Tell the user:
> **Important:** By default, Telegram bots in groups can only see `/commands` and direct @mentions. To let the bot see all messages:
>
> 1. Message **@BotFather** on Telegram
> 2. Send `/setprivacy`
> 3. Select your bot
> 4. Choose **Disable**
>
> Alternatively, make the bot an **admin** in the group (admins can see all messages).

### 4c. Enable Forum Topics (recommended)

Tell the user:
> For multi-project isolation, your Telegram group should have **Forum Topics** enabled:
>
> 1. Create a new Telegram group (or use an existing one)
> 2. Go to Group Settings → Topics → Enable
> 3. Add your bot to the group and make it an admin
> 4. Create topics for different projects

### 4d. Get the Chat ID

The bot must be running to respond to `/chatid`. Build and start it first:

```bash
npm run build
```

Run briefly (set Bash tool timeout to 15000ms):
```bash
npx tsx --env-file=.env src/index.ts
```

Tell the user:
> Send `/chatid` to your bot in the Telegram group. The bot will reply with the registration ID.
>
> If the group has topics, send `/chatid` in the **General** topic.

After getting the chat ID, stop the temporary process.

## 5. Configure Assistant Name and Register Group

### 5a. Ask for trigger word

Ask the user:
> What trigger word do you want to use? (default: `Andy`)
>
> In group chats, messages starting with `@TriggerWord` will activate the agent.

### 5b. Register the main channel

Write `data/registered_groups.json`:

```json
{
  "CHAT_JID": {
    "name": "GROUP_NAME",
    "folder": "main",
    "trigger": "@ASSISTANT_NAME",
    "added_at": "CURRENT_ISO_TIMESTAMP",
    "runtime": "lume",
    "requiresTrigger": false
  }
}
```

**Important:** Set `"runtime": "lume"` — this tells NanoClaw to use the Lume VM instead of containers.

### 5c. Update assistant name if not "Andy"

If the user chose a name other than `Andy`, update ALL of these files:
1. `src/config.ts` — change the `ASSISTANT_NAME` default
2. `groups/global/CLAUDE.md` — change the persona name and heading
3. `groups/main/CLAUDE.md` — change the persona name and heading

**All three files must be updated**, otherwise the agent will introduce itself with the wrong name.

## 6. Configure launchd Service (Optional)

Ask the user:
> Do you want NanoClaw to start automatically on login?

If yes:

**Important:** Use `--env-file=.env` in ProgramArguments so the service loads environment variables from `.env`. Without this, variables like `LUME_VM_NAME` and `LUME_VM_IP` won't be available.

```bash
NODE_PATH=$(which node)
PROJECT_PATH=$(pwd)
HOME_PATH=$HOME

cat > ~/Library/LaunchAgents/com.nanoclaw-desktop.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.nanoclaw-desktop</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE_PATH}</string>
        <string>--env-file=.env</string>
        <string>${PROJECT_PATH}/dist/index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${PROJECT_PATH}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:${HOME_PATH}/.local/bin:/opt/homebrew/bin</string>
        <key>HOME</key>
        <string>${HOME_PATH}</string>
    </dict>
    <key>StandardOutPath</key>
    <string>${PROJECT_PATH}/logs/nanoclaw.log</string>
    <key>StandardErrorPath</key>
    <string>${PROJECT_PATH}/logs/nanoclaw.error.log</string>
</dict>
</plist>
EOF

npm run build
mkdir -p logs
launchctl load ~/Library/LaunchAgents/com.nanoclaw-desktop.plist
```

If no, tell them how to start manually:
```bash
npm run dev
```

## 7. Test

Start the service if not already running:
```bash
npm run dev
```

Check the logs for successful startup:
```bash
tail -20 logs/nanoclaw.log
```

You should see:
- `Database initialized`
- `Lume VM already reachable via SSH`
- `Telegram bot connected`
- `NanoClaw running (trigger: @AssistantName)`

Tell the user:
> Send `@ASSISTANT_NAME hello` in your Telegram group.
>
> The first response may take 30-60 seconds as the agent starts up in the VM.
>
> If you have Forum Topics enabled, each topic will automatically create its own isolated workspace.

## Troubleshooting

**Lume VM not starting:**
- Check VM status: `lume ls`
- Start manually: `lume run VM_NAME --shared-dir PROJECT_ROOT`
- Check IP: `lume get VM_NAME --format json`
- Note: `lume get` may show "stopped" even when the VM is running. Test SSH directly.

**SSH connection refused:**
- Verify "Remote Login" is enabled in VM: System Settings → General → Sharing → Remote Login
- The VM may need 1-2 minutes to fully boot after creation
- Try: `ssh -o StrictHostKeyChecking=no lume@VM_IP`

**SSH permission denied:**
- Key-based auth may not be set up. Use `sshpass -p "lume" ssh-copy-id lume@VM_IP`
- Verify the VM user was created with username `lume` and password `lume`

**`command not found: node` in VM:**
- Node.js was installed to `~/local/bin` which isn't in PATH for non-login SSH shells
- The lume-runner already adds `$HOME/local/bin` to PATH. If still failing, verify: `ssh lume@VM_IP '$HOME/local/bin/node --version'`

**Agent timeout (ETIMEDOUT):**
- The VM may not be running. Check `lume ls`
- NanoClaw auto-starts the VM on first use, but it takes time to boot

**No response to messages:**
- Verify bot privacy is disabled (BotFather → `/setprivacy` → Disable) OR bot is a group admin
- Verify trigger pattern: messages must start with `@AssistantName` (unless `requiresTrigger: false`)
- Check logs: `tail -50 logs/nanoclaw.log`
- Verify the bot is in the Telegram group
- Check that `TELEGRAM_ONLY=true` is in `.env`

**Bot responds with wrong name:**
- Check ALL persona files: `groups/global/CLAUDE.md`, `groups/main/CLAUDE.md`, and `src/config.ts`
- All three must have the correct assistant name

**Messages going to wrong topic:**
- This shouldn't happen — each topic auto-creates its own workspace
- Check that the group has Forum Topics enabled in Telegram settings
- Verify `data/ipc/` has separate directories per topic (e.g. `workspace~t16/`)

**Unload service:**
```bash
launchctl unload ~/Library/LaunchAgents/com.nanoclaw-desktop.plist
```
