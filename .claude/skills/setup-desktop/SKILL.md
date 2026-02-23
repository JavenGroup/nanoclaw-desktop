---
name: setup-desktop
description: Set up NanoClaw Desktop with Lume macOS VM, Telegram bot, and Claude authentication. Use this for first-time installation on macOS with the Desktop (Lume) runtime. Triggers on "setup desktop", "setup lume", "install desktop".
---

# NanoClaw Desktop Setup

Run all commands automatically. Only pause when user action is required (Telegram bot creation, configuration choices).

**UX Note:** When asking the user questions, prefer using the `AskUserQuestion` tool instead of just outputting text.

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
lume create --name default --os macos
```

This downloads a macOS restore image and creates the VM. It takes a while (several GB download).

Start the VM (with display so the user can see the desktop):
```bash
lume run --name default --display
```

Run this with `run_in_background: true`. The VM will take 1-2 minutes to boot.

### 3c. Get the VM IP and verify SSH access

```bash
lume get --name default --format json
```

Extract the IP address, then test SSH:
```bash
ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 lume@VM_IP echo "SSH OK"
```

Default credentials: user `lume`, no password (key-based auth via Lume).

### 3d. Install tools inside the VM

SSH into the VM and install the agent-runner and patchright browser:

```bash
ssh lume@VM_IP 'bash -s' << 'SETUP'
# Install Homebrew if not present
which brew || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
eval "$(/opt/homebrew/bin/brew shellenv)"

# Install Node.js
brew install node

# Install patchright browser
npx patchright install chromium
SETUP
```

Then copy the agent-runner to the VM's shared filesystem:
```bash
cp -r container/agent-runner /path/to/shared/
```

The shared filesystem is available at `/Volumes/My Shared Files` inside the VM (VirtioFS).

### 3e. Configure shared directory

Lume VMs use VirtioFS for host-VM file sharing. The NanoClaw data directories must be accessible:

```bash
# Ensure data directories exist
mkdir -p data/ipc data/sessions
mkdir -p groups/global groups/main
```

Verify from inside the VM:
```bash
ssh lume@VM_IP ls "/Volumes/My Shared Files/"
```

The project root should be visible as a shared directory.

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

### 4b. Enable Forum Topics (recommended)

Tell the user:
> For multi-project isolation, your Telegram group should have **Forum Topics** enabled:
>
> 1. Create a new Telegram group (or use an existing one)
> 2. Go to Group Settings → Topics → Enable
> 3. Add your bot to the group and make it an admin
> 4. Create topics for different projects

### 4c. Get the Chat ID

Tell the user:
> Send `/chatid` to your bot in the Telegram group. The bot will reply with the registration ID.
>
> If the group has topics, send `/chatid` in the **General** topic.

## 5. Configure Assistant Name and Register Group

### 5a. Ask for trigger word

Ask the user:
> What trigger word do you want to use? (default: `Andy`)
>
> In group chats, messages starting with `@TriggerWord` will activate the agent.

### 5b. Register the main channel

First, build and start briefly to initialize the database:

```bash
npm run build
```

Run briefly (set Bash tool timeout to 15000ms):
```bash
npx tsx --env-file=.env src/index.ts
```

Then register the group. Write `data/registered_groups.json`:

```json
{
  "CHAT_JID": {
    "name": "GROUP_NAME",
    "folder": "FOLDER_NAME",
    "trigger": "@ASSISTANT_NAME",
    "added_at": "CURRENT_ISO_TIMESTAMP",
    "runtime": "lume"
  }
}
```

**Important:** Set `"runtime": "lume"` — this tells NanoClaw to use the Lume VM instead of containers.

For the main (admin) channel, also set:
```json
{
  "MAIN_JID": {
    "name": "main",
    "folder": "main",
    "trigger": "@ASSISTANT_NAME",
    "added_at": "CURRENT_ISO_TIMESTAMP",
    "runtime": "lume",
    "requiresTrigger": false
  }
}
```

### 5c. Update assistant name if not "Andy"

If the user chose a name other than `Andy`, update:
1. `src/config.ts` — change the `ASSISTANT_NAME` default
2. `groups/global/CLAUDE.md` — change the persona name

## 6. Configure launchd Service (Optional)

Ask the user:
> Do you want NanoClaw to start automatically on login?

If yes:

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
tail -20 /tmp/nanoclaw.log
```

You should see:
- `Database initialized`
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
- Start manually: `lume run --name default --display`
- Check IP: `lume get --name default --format json`

**SSH connection fails:**
- Verify VM is running and has an IP
- Try: `ssh -o StrictHostKeyChecking=no lume@VM_IP`
- The VM may need 1-2 minutes to fully boot

**Agent timeout (ETIMEDOUT):**
- The VM may not be running. Check `lume ls`
- NanoClaw auto-starts the VM on first use, but it takes time to boot

**No response to messages:**
- Verify trigger pattern: messages must start with `@AssistantName`
- Check logs: `tail -50 /tmp/nanoclaw.log` or `logs/nanoclaw.log`
- Verify the bot is an admin in the Telegram group
- Check that `TELEGRAM_ONLY=true` is in `.env`

**Messages going to wrong topic:**
- This shouldn't happen — each topic auto-creates its own workspace
- Check that the group has Forum Topics enabled in Telegram settings
- Verify `data/ipc/` has separate directories per topic (e.g. `workspace~t16/`)

**Unload service:**
```bash
launchctl unload ~/Library/LaunchAgents/com.nanoclaw-desktop.plist
```
