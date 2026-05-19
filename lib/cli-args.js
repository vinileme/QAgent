/**
 * Parser compartilhado para modos headless / Open WebUI / sessão multi-turno.
 *
 * Exemplos:
 *   node chat.js --session mobile "Olá"
 *   node chat.js --json --session webui "Explique REST"
 *   node qa-agent.js --session qa-1 --autonomous "/path/to/repo"
 */
export function parseCliArgs(argv) {
    const flags = {
        session: null,
        reset: false,
        json: false,
        autonomous: false,
        message: "",
    };
    const positional = [];

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === "--session" && argv[i + 1]) {
            flags.session = argv[++i];
            continue;
        }
        if (arg === "--reset") {
            flags.reset = true;
            continue;
        }
        if (arg === "--json") {
            flags.json = true;
            continue;
        }
        if (arg === "--autonomous" || arg === "-y") {
            flags.autonomous = true;
            continue;
        }
        if (arg === "--help" || arg === "-h") {
            flags.help = true;
            continue;
        }
        if (arg.startsWith("-")) {
            continue;
        }
        positional.push(arg);
    }

    flags.message = positional.join(" ").trim();

    // Lê stdin quando não há mensagem na argv (pipe do Open WebUI)
    return flags;
}

export async function readStdinMessage() {
    if (process.stdin.isTTY) return "";
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf-8").trim();
}

export function printJson(payload) {
    process.stdout.write(JSON.stringify(payload) + "\n");
}

export function emitResponse({ flags, response, session, extra = {} }) {
    if (flags.json) {
        printJson({ response, session, ...extra });
    } else {
        console.log(response);
    }
}
