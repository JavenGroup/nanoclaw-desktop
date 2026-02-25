---
name: patchright-browser
description: Anti-detection browser for sites that block automation (Xiaohongshu, Taobao, etc). Uses Patchright (undetected Playwright fork) with real macOS GPU. Use snapshot + refs to browse, just like agent-browser.
allowed-tools: Bash(patchright-browser:*)
---

# Anti-Detection Browser with patchright-browser

## Quick start

```bash
patchright-browser open <url>        # Navigate to page
patchright-browser snapshot -i       # Get interactive elements with refs
patchright-browser click @e1         # Click element by ref
patchright-browser fill @e2 "text"   # Fill input by ref
patchright-browser close             # Close browser
```

## Core workflow

1. Navigate: `patchright-browser open <url>`
2. Snapshot: `patchright-browser snapshot -i` (returns elements with refs like `@e1`, `@e2`)
3. Interact using refs from the snapshot
4. Re-snapshot after navigation or significant DOM changes

## When to use (instead of agent-browser)

- Site shows blank page or CAPTCHA with `agent-browser`
- Site known to block bots: xiaohongshu.com, taobao.com, etc.
- Need real browser fingerprint (WebGL, Canvas, plugins)

## Commands

### Navigation

```bash
patchright-browser open <url>      # Navigate to URL
patchright-browser back            # Go back
patchright-browser forward         # Go forward
patchright-browser reload          # Reload page
patchright-browser close           # Close browser
```

### Snapshot (page analysis)

```bash
patchright-browser snapshot        # All visible elements
patchright-browser snapshot -i     # Interactive elements only (recommended)
```

### Interactions (use @refs from snapshot)

```bash
patchright-browser click @e1           # Click
patchright-browser fill @e2 "text"     # Clear and type
patchright-browser type @e2 "text"     # Type without clearing (append)
patchright-browser select @e1 "value"  # Select dropdown option
patchright-browser hover @e1           # Hover
patchright-browser press Enter         # Press key (Enter, Escape, Tab, etc.)
patchright-browser scroll down 500     # Scroll page (up/down/left/right)
```

All interaction commands also accept CSS selectors: `patchright-browser click "#submit-btn"`

### Get information

```bash
patchright-browser text [url]          # Get visible text
patchright-browser html [url]          # Get full HTML
patchright-browser eval "document.title"  # Run JavaScript
```

### Screenshots

```bash
patchright-browser screenshot          # Save to workspace
patchright-browser screenshot --full   # Full page screenshot
```

### Wait

```bash
patchright-browser wait @e1                  # Wait for element
patchright-browser wait 2000                 # Wait milliseconds
patchright-browser wait --text "Success"     # Wait for text to appear
patchright-browser wait --url "**/dashboard" # Wait for URL pattern
```

### Status

```bash
patchright-browser status              # Show browser state and open pages
```

## Example: Browse Xiaohongshu

```bash
patchright-browser open "https://www.xiaohongshu.com/explore"
patchright-browser snapshot -i
# Output shows: @e1 link "推荐", @e2 link "穿搭", @e3 textbox "搜索" ...

patchright-browser fill @e3 "咖啡推荐"
patchright-browser press Enter
patchright-browser wait 2000
patchright-browser snapshot -i   # See search results
patchright-browser screenshot
```

## Example: Login to a site

```bash
patchright-browser open "https://example.com/login"
patchright-browser snapshot -i
# Output: @e1 textbox "Email", @e2 textbox "Password" [password], @e3 button "Sign In"

patchright-browser fill @e1 "user@example.com"
patchright-browser fill @e2 "password123"
patchright-browser click @e3
patchright-browser wait --url "**/dashboard"
patchright-browser snapshot -i   # Verify logged in
```

## Notes

- Browser runs headed (visible in VM) — intentional for anti-detection
- Uses real macOS GPU for WebGL/Canvas
- Per-topic fingerprint diversification (window size, UA, Canvas, WebGL, Audio)
- Login state persists across invocations (same topic = same browser profile)
- Only available in Lume VM runtime (not in containers)
