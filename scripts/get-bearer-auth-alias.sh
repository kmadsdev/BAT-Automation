#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ALIAS_CMD="alias get-bearer-auth='node \"${ROOT_DIR}/scripts/get-bearer-auth.mjs\"'"

SHELL_NAME="${SHELL:-}"
if [[ "$SHELL_NAME" == *"zsh"* ]]; then
    RC_FILE="${HOME}/.zshrc"
elif [[ "$SHELL_NAME" == *"bash"* ]]; then
    RC_FILE="${HOME}/.bashrc"
else
    RC_FILE="${HOME}/.zshrc"
fi

if [[ -f "$RC_FILE" ]]; then
    if grep -q "get-bearer-auth" "$RC_FILE"; then
        tmpfile="${RC_FILE}.tmp"
        awk -v alias_cmd="$ALIAS_CMD" '
            BEGIN { replaced = 0 }
            /get-bearer-auth/ {
                if (!replaced) {
                    print alias_cmd
                    replaced = 1
                }
                next
            }
            { print }
            END {
                if (!replaced) {
                    print alias_cmd
                }
            }
        ' "$RC_FILE" > "$tmpfile"
        mv "$tmpfile" "$RC_FILE"
    fi
else
    printf '%s\n' "$ALIAS_CMD" >> "$RC_FILE"
fi

echo "Alias installed in $RC_FILE. Rode: source $RC_FILE"
