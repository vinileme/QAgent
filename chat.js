/**
 * Frente 1 — Chat local JarVinis (PC / celular via Open WebUI + sessão).
 *
 * Uso:
 *   npm run start:chat
 *   node chat.js "sua pergunta"
 *   node chat.js --session webui "continuação"
 *   node chat.js --json --session mobile "pergunta"
 *   echo "pergunta" | node chat.js --json --session pipe
 *   node chat.js --session webui --reset
 */
import chalk from "chalk";
import figlet from "figlet";
import { input } from "@inquirer/prompts";
import { getChatModel, getObsidianVaultPath } from "./lib/config.js";
import { loadVaultFull, saveLearnedTopic } from "./lib/vault.js";
import { callOllamaChat } from "./lib/ollama.js";
import { performWebSearch, extractSearchQuery } from "./lib/web-search.js";
import { loadSession, saveSession, clearSession } from "./lib/session.js";
import {
    parseCliArgs,
    readStdinMessage,
    emitResponse,
    printJson,
} from "./lib/cli-args.js";

const flags = parseCliArgs(process.argv.slice(2));
const vaultPath = getObsidianVaultPath();
const systemPrompt = loadVaultFull(vaultPath);
const model = getChatModel();

const IS_HEADLESS = Boolean(flags.session || flags.message || !process.stdin.isTTY);

function printHelp() {
    console.log(`
JarVinis Chat (Frente 1)

  npm run start:chat              Modo interativo no terminal
  node chat.js "pergunta"         Uma pergunta, resposta no stdout
  node chat.js --session ID "…"   Multi-turno (Open WebUI / celular)
  node chat.js --json --session ID "…"   Saída JSON: {"response","session"}
  node chat.js --session ID --reset      Apaga histórico da sessão

Open WebUI (pipe / função externa):
  node /caminho/chat.js --json --session {{user_id}} "{{prompt}}"
`);
}

async function resolveUserMessage() {
    if (flags.message) return flags.message;
    const stdinMsg = await readStdinMessage();
    return stdinMsg;
}

async function runChatTurn(messages, { silent = false } = {}) {
    const data = await callOllamaChat({
        messages,
        model,
        systemPrompt,
        stream: !silent && !flags.json,
        silent: silent || flags.json,
    });

    if (data.error) return { error: data.error };

    let aiResponse = data.message.content.trim();

    const searchQuery = extractSearchQuery(aiResponse);
    if (searchQuery) {
        if (!silent && !flags.json) {
            console.log(`\n🔍 Buscando na Wikipedia: "${searchQuery}"...`);
        }

        const searchResults = await performWebSearch(searchQuery);
        if (searchResults) {
            const learnPrompt = `O usuário perguntou algo que não estava nas notas. Pesquisa:\n\n${searchResults}\n\nResponda de forma clara em PT-BR. Seja preciso.`;
            messages.push({ role: "assistant", content: aiResponse });
            messages.push({ role: "user", content: learnPrompt });

            const learnData = await callOllamaChat({
                messages,
                model,
                systemPrompt,
                stream: !silent && !flags.json,
                silent: silent || flags.json,
            });

            if (learnData.error) return { error: learnData.error };
            aiResponse = learnData.message.content.trim();

            const saved = saveLearnedTopic(vaultPath, searchQuery, aiResponse);
            if (saved && !flags.json) {
                console.log(`\n💾 Conhecimento salvo em: ${saved}`);
            }
        } else {
            aiResponse =
                "Ainda não tenho essa informação nas minhas notas e não consegui buscar na web agora.";
        }
    }

    return { response: aiResponse };
}

async function runHeadless() {
    if (flags.help) {
        printHelp();
        process.exit(0);
    }

    if (flags.reset && flags.session) {
        clearSession("chat", flags.session);
        if (flags.json) printJson({ ok: true, session: flags.session, reset: true });
        else console.log(`Sessão '${flags.session}' reiniciada.`);
        process.exit(0);
    }

    const userMessage = await resolveUserMessage();
    if (!userMessage) {
        if (flags.json) printJson({ error: "Mensagem vazia. Passe o prompt como argumento ou via stdin." });
        else console.error("❌ Informe uma mensagem.");
        process.exit(1);
    }

    let messages = [];
    if (flags.session) {
        const saved = loadSession("chat", flags.session);
        if (saved?.messages) messages = saved.messages;
    }

    messages.push({ role: "user", content: userMessage });

    const result = await runChatTurn(messages, { silent: true });
    if (result.error) {
        if (flags.json) printJson({ error: result.error, session: flags.session });
        else console.error("❌ Erro Ollama:", result.error);
        process.exit(1);
    }

    messages.push({ role: "assistant", content: result.response });

    if (flags.session) {
        saveSession("chat", flags.session, { messages });
    }

    emitResponse({
        flags,
        response: result.response,
        session: flags.session || null,
    });
    process.exit(0);
}

async function runInteractive() {
    console.clear();
    console.log(chalk.cyan(figlet.textSync("JARVINIS", { horizontalLayout: "full" })));
    console.log(
        chalk.green(
            "💬 Chat local ativo. Digite sua mensagem (ou 'sair').\n" +
                `   Modelo: ${model}\n`
        )
    );

    const messages = [];

    while (true) {
        let userMessage;
        try {
            userMessage = await input({ message: chalk.cyan("👤 Você:") });
        } catch (e) {
            if (e.name === "ExitPromptError") process.exit(0);
            throw e;
        }

        const normalized = userMessage.trim().toLowerCase();
        if (["sair", "exit", "quit"].includes(normalized)) process.exit(0);
        if (!userMessage.trim()) continue;

        messages.push({ role: "user", content: userMessage });

        const result = await runChatTurn(messages);
        if (result.error) {
            console.error(chalk.red("❌ Erro Ollama:", result.error));
            messages.pop();
            continue;
        }

        messages.push({ role: "assistant", content: result.response });
    }
}

if (IS_HEADLESS) {
    runHeadless().catch((err) => {
        console.error(err);
        process.exit(1);
    });
} else {
    runInteractive().catch(console.error);
}
