#!/bin/bash
# PreToolUse: Block writes that introduce synchronize: true in TypeORM source files.
# Only checks .ts and .js files — not markdown, shell scripts, or other text.

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)

if [[ "$TOOL" == "Edit" || "$TOOL" == "Write" ]]; then
  FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null)

  # Only enforce on TypeScript/JavaScript source files
  if [[ "$FILE" =~ \.(ts|js)$ ]]; then
    CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // empty' 2>/dev/null)

    # Match synchronize: true but not synchronize: false or comments
    if echo "$CONTENT" | grep -qP "synchronize\s*:\s*true(?!\w)"; then
      echo "BLOCKED: 'synchronize: true' is forbidden in TypeScript source files." >&2
      echo "TypeORM auto-sync will destroy production data. Use 'npm run migration:generate' instead." >&2
      exit 2
    fi
  fi
fi

exit 0
