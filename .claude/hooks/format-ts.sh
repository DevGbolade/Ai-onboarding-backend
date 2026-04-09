#!/bin/bash
# PostToolUse: Format TypeScript files with Prettier after every edit.

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null)

if [[ -z "$FILE" ]]; then
  exit 0
fi

# Only format TypeScript/JavaScript files
if [[ "$FILE" =~ \.(ts|js|tsx|jsx)$ ]]; then
  cd "$CLAUDE_PROJECT_DIR" && npx prettier --write "$FILE" --log-level silent 2>/dev/null || true
fi

exit 0
