/**
 * Minimal Engram REST client.
 * No external HTTP dependency — uses the global `fetch` available in Node 18+
 * and all modern runtimes (Workers, Edge, browsers, Bun, Deno).
 */

export interface EngramClientOptions {
  apiKey: string;
  baseUrl?: string;
}

export const DEFAULT_BASE_URL = "https://api.lumetra.io";

export class EngramClient {
  readonly apiKey: string;
  readonly baseUrl: string;

  constructor(opts: EngramClientOptions) {
    if (!opts.apiKey) {
      throw new Error("EngramClient: apiKey is required");
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "engram-vercel-ai/0.1.0",
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: this.headers(),
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    const text = await res.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (!res.ok) {
      const detail =
        typeof parsed === "string" ? parsed : JSON.stringify(parsed);
      throw new Error(
        `Engram ${method} ${path} failed: ${res.status} ${res.statusText} — ${detail}`,
      );
    }
    return parsed as T;
  }

  storeMemory(bucket: string, content: string): Promise<unknown> {
    return this.request(
      "POST",
      `/v1/buckets/${encodeURIComponent(bucket)}/memories`,
      { content },
    );
  }

  queryMemory(bucket: string, query: string): Promise<unknown> {
    return this.request("POST", `/v1/query`, { query, bucket });
  }

  listBuckets(limit = 50, offset = 0): Promise<unknown> {
    return this.request(
      "GET",
      `/v1/buckets?limit=${limit}&offset=${offset}`,
    );
  }

  listMemories(bucket: string, limit = 50): Promise<unknown> {
    return this.request(
      "GET",
      `/v1/buckets/${encodeURIComponent(bucket)}/memories?limit=${limit}`,
    );
  }

  deleteMemory(bucket: string, memoryId: string): Promise<unknown> {
    return this.request(
      "DELETE",
      `/v1/buckets/${encodeURIComponent(bucket)}/memories/${encodeURIComponent(memoryId)}`,
    );
  }

  clearMemories(bucket: string): Promise<unknown> {
    return this.request(
      "DELETE",
      `/v1/buckets/${encodeURIComponent(bucket)}/memories`,
    );
  }
}
