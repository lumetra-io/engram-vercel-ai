# @lumetra/engram-vercel-ai

First-party [Vercel AI SDK](https://ai-sdk.dev/) adapter for [Engram](https://lumetra.io) — Lumetra's durable, explainable memory service for AI agents.

Exposes Engram's six REST endpoints as Vercel AI SDK tools so a model running through `generateText` / `streamText` / `streamObject` can store, recall, list, and delete memories on its own.

## Install

```bash
npm install @lumetra/engram-vercel-ai ai zod
```

`ai` (>= 4) and `zod` are peer dependencies; install them in your app.

## Quick start

```ts
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createEngramTools } from "@lumetra/engram-vercel-ai";

const result = streamText({
  model: openai("gpt-4o"),
  tools: createEngramTools({
    apiKey: process.env.ENGRAM_API_KEY!, // or omit to read from env
    bucket: "alice",                      // optional default bucket
  }),
  prompt: "Remember that my favorite color is blue, then tell me what you know about my preferences.",
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

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
