# AGENTS.md

## Cursor Cloud specific instructions

### Project Overview

JARVINIS is a Node.js (ES Modules) personal AI assistant integrating Amazon Alexa with a local Ollama LLM. Two entry points:

- `alexa-server.js` — Express server on port 3001 accepting Alexa Skill POST requests at `/alexa`, forwarding to Ollama.
- `index.js` — Standalone QA Coordinator agent that reads an Obsidian vault for context, queries Ollama, and performs Wikipedia web searches to learn new topics.

### Running Services

1. **Start Ollama** (must be running before either JS entry point):
   ```
   ollama serve
   ```
2. **Create the custom model** (only needed once, or after editing `Modelfile`):
   ```
   ollama create jarvinis -f Modelfile
   ```
3. **Start the Alexa server:**
   ```
   node alexa-server.js
   ```
4. **Run the QA agent (one-shot):**
   ```
   node index.js
   ```

### Environment Variables

A `.env` file (not committed) is required:

| Variable | Example | Notes |
|----------|---------|-------|
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama API endpoint |
| `OLLAMA_MODEL` | `jarvinis` | Model name for the QA agent |
| `OBSIDIAN_VAULT_PATH` | `/workspace/vault` | Path to the markdown knowledge vault |
| `PORT` | `3001` | Express server port (optional, defaults to 3001) |

### Non-obvious Caveats

- **No GPU in Cloud Agent VMs**: Ollama runs on CPU only. The `llama3`-based `jarvinis` model takes ~15-20s per response, which exceeds the Alexa server's 6.5s abort timeout. This is expected; the Alexa timeout is intentional (Amazon's limit is 8s). For faster dev testing, call Ollama directly via `curl http://localhost:11434/api/generate -d '{"model":"jarvinis","prompt":"...","stream":false}'`.
- **No test suite**: `package.json` has only a placeholder test script. Verify manually by sending POST requests to `/alexa`.
- **No lint/build step**: This is raw Node.js with no transpilation or linting configured.
- **Alexa integration requires Ngrok + Amazon Developer Console**: These external services are not runnable in the cloud VM. The server itself works locally without them.
- **`index.js` exits after one query**: It's a one-shot script, not a long-running service. Edit the `runAgent(...)` call at the bottom to test different queries.
