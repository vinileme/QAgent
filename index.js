/**
 * Roteador de entrypoints — mantém compatibilidade com `node index.js`.
 *
 *   node index.js          → chat (Frente 1)
 *   node index.js chat     → chat
 *   node index.js qa       → agente QA (Frente 2)
 */
const mode = process.argv[2]?.toLowerCase();
const forward = mode === "qa" ? "./qa-agent.js" : mode === "chat" || !mode ? "./chat.js" : null;

if (!forward) {
    console.log(`
JARVINIS — antigravity-qa-agent

  node index.js              Chat local (padrão)
  node index.js chat         Chat local
  node index.js qa           Agente QA

  npm run start:chat
  npm run start:qa
  npm run start:alexa
`);
    process.exit(mode === "help" || mode === "--help" ? 0 : 1);
}

const extraArgs = mode === "qa" || mode === "chat" ? process.argv.slice(3) : process.argv.slice(2);
process.argv = [process.argv[0], process.argv[1], ...extraArgs];
await import(forward);
