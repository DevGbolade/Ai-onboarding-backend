---
name: ask-api
description: Send a question to the running onboarding agent API and show the answer. Use when you want to test the RAG endpoint locally.
allowed-tools: Bash(curl:*)
argument-hint: "[question] [optional: service1,service2]"
---

Send a question to the local onboarding agent API at `http://localhost:3000/api/query/ask`.

Parse `$ARGUMENTS`:
- Everything before the last bracketed group is the question
- If the last token looks like comma-separated service IDs, treat it as `serviceFilter`

Build and run the curl command:

```bash
curl -s -X POST http://localhost:3000/api/query/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "<question>", "serviceFilter": ["<services>"]}' \
  | jq '.'
```

If no service filter is given, omit the `serviceFilter` field entirely.

Display the response with:
- The `answer` field formatted as prose
- A table of `sources` (serviceId, filePath, chunkType, similarity)
- The list of `consultedServices`

If the server is not running, say so clearly and suggest `npm run start:dev`.
