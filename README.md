# @lumetra/engram-vercel-ai

First-party [Vercel AI SDK](https://ai-sdk.dev/) adapter for [Engram](https://lumetra.io) — Lumetra's durable, explainable memory service for AI agents.

Exposes Engram's six REST endpoints as Vercel AI SDK tools so a model running through `generateText` / `streamText` / `streamObject` can store, recall, list, and delete memories on its own.

## Install

```bash
npm install @lumetra/engram-vercel-ai ai zod
```

`ai` (>= 5) and `zod` are peer dependencies; install them in your app. The tool definitions use the `inputSchema` field name introduced in **AI SDK v5**. On v4 the field was `parameters` — use `@lumetra/engram-vercel-ai@<v0.1.1` if you're pinned to AI SDK v4.

## Quick start (AI SDK v6, current)

```ts
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, stepCountIs } from "ai";
import { createEngramTools } from "@lumetra/engram-vercel-ai";

const result = await generateText({
  model: anthropic("claude-sonnet-4-5"),
  tools: createEngramTools({
    apiKey: process.env.ENGRAM_API_KEY!, // or omit to read from env
    bucket: "alice",                      // optional default bucket
  }),
  // v6 replaces v4/v5's `maxSteps: N` with stopWhen:
  stopWhen: stepCountIs(5),
  prompt: "Remember that my favorite color is blue, then tell me what you know about my preferences.",
});

console.log(result.text);

// Tool calls live on result.steps[i].content in v6, not result.toolCalls.
for (const step of result.steps) {
  for (const part of step.content) {
    if (part.type === "tool-call") {
      console.log("called", part.toolName, "with", part.input);
    }
  }
}
```

> **AI SDK v6 migration notes** caught during e2e testing:
> - `maxSteps: N` → `stopWhen: stepCountIs(N)` (`stepCountIs` is exported from `ai`).
> - `result.toolCalls` / `result.toolResults` at the top level are now empty arrays. The same data lives on `result.steps[i].content` as items typed `tool-call` / `tool-result`.
> - The tool factory uses `inputSchema` (renamed from `parameters` in v5+). If your app is still on v4, pin `@lumetra/engram-vercel-ai@0.1.0` (the original release used v4 shape) — though we strongly recommend upgrading.

The factory returns six tools, keyed by camelCase names:

| Tool | Engram REST call |
|---|---|
| `storeMemory` | `POST /v1/buckets/{bucket}/memories` |
| `queryMemory` | `POST /v1/query` |
| `listBuckets` | `GET /v1/buckets` |
| `listMemories` | `GET /v1/buckets/{bucket}/memories` |
| `deleteMemory` | `DELETE /v1/buckets/{bucket}/memories/{memoryId}` |
| `clearMemories` | `DELETE /v1/buckets/{bucket}/memories` |

You can also subset the tools you want exposed to the model:

```ts
const { storeMemory, queryMemory } = createEngramTools({ bucket: "alice" });
const result = streamText({
  model: openai("gpt-4o"),
  tools: { storeMemory, queryMemory },
  prompt: "...",
});
```

## Configuration

`createEngramTools(opts)` accepts:

- `apiKey?: string` — Engram API key. Falls back to `process.env.ENGRAM_API_KEY`. Throws if neither is provided.
- `bucket?: string` — Default bucket. When set, the model may omit `bucket` from any tool call. When unset, the model MUST supply `bucket` explicitly.
- `baseUrl?: string` — Override the Engram REST base URL (for self-hosted deployments). Defaults to `https://api.lumetra.io`.

## Direct REST client

If you want to call Engram without going through a tool, the same client is exported:

```ts
import { EngramClient } from "@lumetra/engram-vercel-ai";

const engram = new EngramClient({ apiKey: process.env.ENGRAM_API_KEY! });
await engram.storeMemory("alice", "Alice prefers metric units.");
const answer = await engram.queryMemory("alice", "What units does Alice like?");
```

## Privacy

See [PRIVACY.md](./PRIVACY.md) and <https://lumetra.io/privacy>.

## License

MIT — see [LICENSE](./LICENSE).
