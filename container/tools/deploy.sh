#!/bin/bash
# Deploy patchright-browser tool to Lume VM (bypasses VirtioFS cache issues)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load VM config from .env
LUME_VM_USER="${LUME_VM_USER:-lume}"
LUME_VM_IP="${LUME_VM_IP:-}"
if [[ -f "$PROJECT_ROOT/.env" ]]; then
  eval "$(grep -E '^LUME_VM_(USER|IP)=' "$PROJECT_ROOT/.env")"
fi
if [[ -z "$LUME_VM_IP" ]]; then
  echo "Error: LUME_VM_IP not set (check .env)" >&2
  exit 1
fi

SSH="ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 ${LUME_VM_USER}@${LUME_VM_IP}"
SCP="scp -o StrictHostKeyChecking=no"

# Deploy
REMOTE_DIR="/Users/${LUME_VM_USER}/local/tools"
echo "Deploying to ${LUME_VM_USER}@${LUME_VM_IP}:${REMOTE_DIR}..."
$SSH "mkdir -p ${REMOTE_DIR}"
$SCP "$SCRIPT_DIR/patchright-browser.mjs" "${LUME_VM_USER}@${LUME_VM_IP}:${REMOTE_DIR}/patchright-browser.mjs"
$SCP "$SCRIPT_DIR/package.json" "${LUME_VM_USER}@${LUME_VM_IP}:${REMOTE_DIR}/package.json"

# Install node_modules only if missing
REMOTE_HAS_MODULES=$($SSH "test -d ${REMOTE_DIR}/node_modules && echo yes || echo no")
if [[ "$REMOTE_HAS_MODULES" == "no" ]]; then
  echo "Installing dependencies on VM..."
  $SSH "cd ${REMOTE_DIR} && PATH=\$HOME/local/bin:/opt/homebrew/bin:\$PATH npm install"
fi

# Verify
$SSH "PATH=/opt/homebrew/bin:\$HOME/local/bin:\$PATH node -c ${REMOTE_DIR}/patchright-browser.mjs" && echo "Deploy OK" || echo "Deploy FAILED: syntax check error"
