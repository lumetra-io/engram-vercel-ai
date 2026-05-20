// End-to-end smoke test for @lumetra/engram-vercel-ai
//
// Verifies that createEngramTools() returns six Vercel-AI-SDK-shaped tools,
// that each tool's Zod inputSchema validates correctly, and that invoking
// `execute` against the real Engram REST API succeeds for all six.
//
// Run AFTER `npm run build`:
//   ENGRAM_API_KEY=... node tests/smoke.mjs

import { createEngramTools } from "../dist/index.js";

const API_KEY = process.env.ENGRAM_API_KEY;
if (!API_KEY) {
  console.error("ENGRAM_API_KEY env var required to run the smoke test.");
  process.exit(2);
}
const BUCKET = `vercel-ai-smoke-${Date.now()}`;

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const tag = ok ? "PASS" : "FAIL";
  const head = `[${tag}] ${name}`;
  if (detail !== undefined) {
    console.log(head + " — " + (typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 200)));
  } else {
    console.log(head);
  }
}

const tools = createEngramTools({ apiKey: API_KEY, bucket: BUCKET });

// 1. Factory shape — six tools, each with inputSchema + execute.
{
  const expected = [
    "storeMemory",
    "queryMemory",
    "listBuckets",
    "listMemories",
    "deleteMemory",
    "clearMemories",
  ];
  const missing = expected.filter((k) => !tools[k]);
  record(
    "factory returns six tools",
    missing.length === 0,
    missing.length ? `missing: ${missing.join(",")}` : `keys=${Object.keys(tools).join(",")}`,
  );

  let shapeOk = true;
  const shapeDetail = {};
  for (const k of expected) {
    const t = tools[k];
    const hasSchema = !!t?.inputSchema;
    const hasExecute = typeof t?.execute === "function";
    const hasDescription = typeof t?.description === "string";
    shapeDetail[k] = { hasSchema, hasExecute, hasDescription };
    if (!hasSchema || !hasExecute || !hasDescription) shapeOk = false;
  }
  record("each tool has description + inputSchema + execute", shapeOk, shapeDetail);
}

// 2. Zod schema validation — the inputSchema is a Zod schema in v6.
//    `.safeParse` lets us validate args without invoking execute.
{
  // valid storeMemory args
  const sm = tools.storeMemory.inputSchema.safeParse({
    content: "Test memory body",
    bucket: BUCKET,
  });
  record("storeMemory schema accepts valid args", sm.success, sm.success ? undefined : sm.error?.message);

  // missing required content -> should fail
  const smBad = tools.storeMemory.inputSchema.safeParse({ bucket: BUCKET });
  record("storeMemory schema rejects missing content", !smBad.success);

  // queryMemory requires `query` (not `question` — easy to get wrong)
  const qm = tools.queryMemory.inputSchema.safeParse({
    query: "What do you remember?",
    bucket: BUCKET,
  });
  record("queryMemory schema accepts valid args (`query` field)", qm.success, qm.success ? undefined : qm.error?.message);

  const qmBad = tools.queryMemory.inputSchema.safeParse({
    question: "wrong field name",
    bucket: BUCKET,
  });
  record("queryMemory schema rejects {question:...} (must use `query`)", !qmBad.success);

  // bucket optional when default configured
  const dm = tools.deleteMemory.inputSchema.safeParse({ memoryId: "abc" });
  record("deleteMemory schema accepts omitted bucket (default configured)", dm.success);
}

// Helper to call execute. In AI SDK v6 each tool's execute receives
// (args, { toolCallId, messages, abortSignal }). We pass a stub options object.
const execOpts = { toolCallId: "smoke", messages: [] };

let storedMemoryId = null;

// 3. storeMemory -> real REST call.
try {
  const out = await tools.storeMemory.execute(
    { content: "Vercel AI smoke: Alice loves metric units.", bucket: BUCKET },
    execOpts,
  );
  record("storeMemory.execute hits POST /v1/buckets/{bucket}/memories", out?.ok === true, out);
} catch (e) {
  record("storeMemory.execute hits POST /v1/buckets/{bucket}/memories", false, e?.message);
}

// store a second one we can later delete by id
try {
  await tools.storeMemory.execute(
    { content: "Vercel AI smoke: target for deletion.", bucket: BUCKET },
    execOpts,
  );
  record("storeMemory.execute (second store for delete target)", true);
} catch (e) {
  record("storeMemory.execute (second store for delete target)", false, e?.message);
}

// 4. listMemories
try {
  const out = await tools.listMemories.execute({ bucket: BUCKET, limit: 10 }, execOpts);
  record("listMemories.execute hits GET /v1/buckets/{bucket}/memories", out?.ok === true);
  // Try to pluck an id for the delete test
  const payload = out?.result;
  const arr = Array.isArray(payload)
    ? payload
    : payload?.memories ?? payload?.data ?? payload?.items;
  if (Array.isArray(arr) && arr.length) {
    storedMemoryId = arr[0].id ?? arr[0].memory_id ?? arr[0].memoryId ?? null;
  }
} catch (e) {
  record("listMemories.execute hits GET /v1/buckets/{bucket}/memories", false, e?.message);
}

// 5. queryMemory
try {
  const out = await tools.queryMemory.execute(
    { query: "What units does Alice prefer?", bucket: BUCKET },
    execOpts,
  );
  record("queryMemory.execute hits POST /v1/query", out?.ok === true, {
    hasAnswer: !!(out?.answer ?? out?.result),
  });
} catch (e) {
  record("queryMemory.execute hits POST /v1/query", false, e?.message);
}

// 6. listBuckets
try {
  const out = await tools.listBuckets.execute({ limit: 5 }, execOpts);
  record("listBuckets.execute hits GET /v1/buckets", out?.ok === true);
} catch (e) {
  record("listBuckets.execute hits GET /v1/buckets", false, e?.message);
}

// 7. deleteMemory (only if we got an id)
if (storedMemoryId) {
  try {
    const out = await tools.deleteMemory.execute(
      { memoryId: storedMemoryId, bucket: BUCKET },
      execOpts,
    );
    record("deleteMemory.execute hits DELETE /v1/buckets/{bucket}/memories/{id}", out?.ok === true);
  } catch (e) {
    record("deleteMemory.execute hits DELETE /v1/buckets/{bucket}/memories/{id}", false, e?.message);
  }
} else {
  record("deleteMemory.execute hits DELETE /v1/buckets/{bucket}/memories/{id}", false, "could not pluck a memory id from listMemories output");
}

// 8. clearMemories
try {
  const out = await tools.clearMemories.execute({ bucket: BUCKET }, execOpts);
  record("clearMemories.execute hits DELETE /v1/buckets/{bucket}/memories", out?.ok === true);
} catch (e) {
  record("clearMemories.execute hits DELETE /v1/buckets/{bucket}/memories", false, e?.message);
}

// 9. Missing API key throws
try {
  delete process.env.ENGRAM_API_KEY;
  let threw = false;
  try {
    createEngramTools({});
  } catch {
    threw = true;
  }
  record("createEngramTools() throws when no apiKey + no env", threw);
} catch (e) {
  record("createEngramTools() throws when no apiKey + no env", false, e?.message);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error("FAILURES:");
  for (const f of failed) console.error(" -", f.name, f.detail ?? "");
  process.exit(1);
}
