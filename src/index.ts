import { tool } from "ai";
import { z } from "zod";
import { EngramClient, DEFAULT_BASE_URL } from "./client.js";

export interface CreateEngramToolsOptions {
  /**
   * Engram API key (e.g. `eng_live_...`). If omitted, falls back to
   * `process.env.ENGRAM_API_KEY`. Throws if neither is set.
   */
  apiKey?: string;
  /**
   * Default bucket used when the model omits the `bucket` argument.
   * If unset, the model MUST supply `bucket` on every tool call.
   */
  bucket?: string;
  /**
   * Override the Engram REST base URL (for self-hosted deployments).
   * Defaults to `https://api.lumetra.io`.
   */
  baseUrl?: string;
}

function resolveApiKey(provided?: string): string {
  if (provided) return provided;
  const fromEnv =
    typeof process !== "undefined" ? process.env?.ENGRAM_API_KEY : undefined;
  if (fromEnv) return fromEnv;
  throw new Error(
    "createEngramTools: no API key provided. Pass `apiKey` or set ENGRAM_API_KEY.",
  );
}

/**
 * Create a set of six Vercel AI SDK tools backed by the Engram REST API.
 *
 * Returned tools are ready to be passed to `generateText`/`streamText`:
 *
 * ```ts
 * import { openai } from "@ai-sdk/openai";
 * import { streamText } from "ai";
 * import { createEngramTools } from "@lumetra/engram-vercel-ai";
 *
 * const result = streamText({
 *   model: openai("gpt-4o"),
 *   tools: createEngramTools({ bucket: "default" }),
 *   prompt: "Remember that my favorite color is blue.",
 * });
 * ```
 */
export function createEngramTools(opts: CreateEngramToolsOptions = {}) {
  const apiKey = resolveApiKey(opts.apiKey);
  const defaultBucket = opts.bucket;
  const client = new EngramClient({
    apiKey,
    baseUrl: opts.baseUrl ?? DEFAULT_BASE_URL,
  });

  const bucketField = defaultBucket
    ? z
        .string()
        .min(1)
        .describe(
          `Memory bucket to operate on. Defaults to "${defaultBucket}" if omitted.`,
        )
        .optional()
    : z
        .string()
        .min(1)
        .describe("Memory bucket to operate on.");

  const requireBucket = (bucket?: string): string => {
    const resolved = bucket ?? defaultBucket;
    if (!resolved) {
      throw new Error(
        "Engram tool call missing `bucket` and no default bucket was configured.",
      );
    }
    return resolved;
  };

  const storeMemory = tool({
    description:
      "Persist a fact, preference, or piece of context to Engram so it can be recalled later. Use for atomic facts (one concept per call).",
    inputSchema: z.object({
      content: z
        .string()
        .min(1)
        .describe("The fact or context to remember. One concept per memory."),
      bucket: bucketField,
    }),
    execute: async ({ content, bucket }) => {
      const b = requireBucket(bucket);
      const result = await client.storeMemory(b, content);
      return { ok: true, bucket: b, result };
    },
  });

  const queryMemory = tool({
    description:
      "Search Engram memory with a natural-language question. Returns a synthesized answer grounded in stored memories.",
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .describe("The natural-language question to ask Engram."),
      bucket: bucketField,
    }),
    execute: async ({ query, bucket }) => {
      const b = requireBucket(bucket);
      const result = await client.queryMemory(b, query);
      return { ok: true, bucket: b, ...((result as object) ?? {}) };
    },
  });

  const listBuckets = tool({
    description:
      "List the memory buckets available under the current Engram tenant.",
    inputSchema: z.object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .default(50)
        .describe("Maximum number of buckets to return.")
        .optional(),
      offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Pagination offset.")
        .optional(),
    }),
    execute: async ({ limit, offset }) => {
      const result = await client.listBuckets(limit ?? 50, offset ?? 0);
      return { ok: true, result };
    },
  });

  const listMemories = tool({
    description:
      "List individual memories inside a bucket. Useful for inspection or before a targeted delete.",
    inputSchema: z.object({
      bucket: bucketField,
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .default(50)
        .describe("Maximum number of memories to return.")
        .optional(),
    }),
    execute: async ({ bucket, limit }) => {
      const b = requireBucket(bucket);
      const result = await client.listMemories(b, limit ?? 50);
      return { ok: true, bucket: b, result };
    },
  });

  const deleteMemory = tool({
    description:
      "Delete a single memory from a bucket by its id. Irreversible.",
    inputSchema: z.object({
      memoryId: z
        .string()
        .min(1)
        .describe("The id of the memory to delete."),
      bucket: bucketField,
    }),
    execute: async ({ memoryId, bucket }) => {
      const b = requireBucket(bucket);
      const result = await client.deleteMemory(b, memoryId);
      return { ok: true, bucket: b, memoryId, result };
    },
  });

  const clearMemories = tool({
    description:
      "Delete ALL memories in a bucket. Destructive — only invoke when the user explicitly asks to wipe memory.",
    inputSchema: z.object({
      bucket: bucketField,
    }),
    execute: async ({ bucket }) => {
      const b = requireBucket(bucket);
      const result = await client.clearMemories(b);
      return { ok: true, bucket: b, result };
    },
  });

  return {
    storeMemory,
    queryMemory,
    listBuckets,
    listMemories,
    deleteMemory,
    clearMemories,
  };
}

export { EngramClient } from "./client.js";
export type { EngramClientOptions } from "./client.js";
