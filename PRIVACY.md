# Privacy

This adapter sends the parameters you (or your agent) pass to its tools — `content`, `query`, `bucket`, `memoryId` — to the Engram REST API at `https://api.lumetra.io` (or the self-hosted base URL you configured). Memories are stored under your Engram tenant, scoped by the API key you provided to `createEngramTools({ apiKey })` or the `ENGRAM_API_KEY` environment variable.

The adapter does not collect, log, or transmit data to any third party other than the Engram service you've explicitly authorized. It does not read your local filesystem or any other Vercel AI SDK state — only the arguments supplied to each tool call and the responses returned by Engram.

For Engram's own data-handling and retention policy, see <https://lumetra.io/privacy>.
