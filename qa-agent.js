/**
 * Frente 2 — Agente QA autônomo (repositório → testes → relatório).
 *
 * Uso:
 *   npm run start:qa
 *   node qa-agent.js --session qa1 "/caminho/do/projeto"
 *   node qa-agent.js --json --session qa1 --autonomous "/path"
 */
import fs from "fs";
import path from "path";
import os from "os";
import ora from "ora";
import chalk from "chalk";
import figlet from "figlet";
import { select, input, checkbox } from "@inquirer/prompts";
import {
    scanRepository,
    readFileContext,
    writeSandboxFile,
    executeTestCommand,
    getRecommendedTestCommand,
} from "./agent-tools.js";
import { bootstrapSandbox } from "./lib/sandbox-bootstrap.js";
import { generatePDFReport } from "./reporter.js";
import {
    getRouterModel,
    getQaModel,
    getHistoryModel,
    getObsidianVaultPath,
} from "./lib/config.js";
import { loadVaultIndex, readVaultNote, saveLearnedTopic } from "./lib/vault.js";
import { callOllamaChat } from "./lib/ollama.js";
import { performWebSearch } from "./lib/web-search.js";
import { loadSession, saveSession, clearSession } from "./lib/session.js";
import {
    parseCliArgs,
    readStdinMessage,
    emitResponse,
    printJson,
} from "./lib/cli-args.js";

const flags = parseCliArgs(process.argv.slice(2));
const vaultPath = getObsidianVaultPath();
const systemContext = loadVaultIndex(vaultPath);

let chatHistory = [];
let savedMainHistory = null;
let basePath = process.cwd();
let isWaitingApproval = false;
let lastTestCommand = "";
let lastTestLog = "";

const IS_HEADLESS = Boolean(flags.session || flags.message || !process.stdin.isTTY);
const IS_HEADLESS_SESSION = IS_HEADLESS && Boolean(flags.session);
const IS_AUTONOMOUS = flags.autonomous;

const MAX_AGENT_TURNS = 25;
let agentTurnCount = 0;

function printHelp() {
    console.log(`
JarVinis QA Agent (Frente 2)

  npm run start:qa
  node qa-agent.js --session ID "cole o caminho do projeto"
  node qa-agent.js --json --session ID --autonomous "/path/to/repo"
  node qa-agent.js --session ID --reset
`);
}

function persistQaSession() {
    if (!flags.session) return;
    saveSession("qa", flags.session, {
        chatHistory,
        basePath,
        lastTestCommand,
        lastTestLog,
        isWaitingApproval,
        savedMainHistory,
    });
}

function finishHeadless(aiResponse, extra = {}) {
    persistQaSession();
    emitResponse({
        flags,
        response: aiResponse,
        session: flags.session,
        waitingApproval: isWaitingApproval,
        ...extra,
    });
    process.exit(0);
}

function normalizePath(raw) {
    let p = raw.trim();
    if (p.startsWith("User/")) p = "/" + p;
    else if (p.startsWith("Users/")) p = "/" + p;
    else if (p.startsWith("~/")) p = path.join(os.homedir(), p.slice(2));
    return p;
}

async function callRouter(messages, silent = false) {
    return callOllamaChat({
        messages,
        model: getRouterModel(),
        systemPrompt: systemContext,
        stream: !silent && !flags.json,
        silent: silent || flags.json,
    });
}

async function compactHistory() {
    if (chatHistory.length <= 7) return;

    const historianSpinner = ora({
        text: "🔄 [Historiador] Compactando a memória da conversa...",
        color: "blue",
    }).start();

    const systemPrompt = chatHistory[0];
    const lastMessage = chatHistory[chatHistory.length - 1];
    const messagesToSummarize = chatHistory.slice(1, -1);

    const summaryPrompt = [
        {
            role: "system",
            content:
                "Você é um Agente Historiador. Resuma a conversa em no máximo 3 linhas. Apenas o resumo, em PT-BR.",
        },
        { role: "user", content: JSON.stringify(messagesToSummarize) },
    ];

    const data = await callOllamaChat({
        messages: summaryPrompt,
        model: getHistoryModel(),
        systemPrompt: "",
        stream: false,
        silent: true,
    });

    if (data.error) historianSpinner.fail("⚠️ Falha ao compactar histórico.");
    else historianSpinner.succeed("🔄 Memória compactada.");

    const summaryText = data.message?.content?.trim() || "Resumo indisponível.";
    chatHistory = [
        systemPrompt,
        { role: "assistant", content: `[HISTÓRICO RESUMIDO]: ${summaryText}` },
        lastMessage,
    ];
}

async function promptUser(aiResponse = null) {
    try {
        if (isWaitingApproval) {
            const action = await select({
                message: chalk.cyan("🤖 O que deseja fazer com o plano de testes?"),
                choices: [
                    { name: "✅ Prosseguir e delegar a escrita", value: "approve" },
                    { name: "✍️ Ajustar instruções", value: "adjust" },
                    { name: "❌ Abortar", value: "abort" },
                ],
            });

            if (action === "approve") {
                isWaitingApproval = false;
                chatHistory.push({
                    role: "user",
                    content:
                        "Aprovado. USE A TAG [DELEGATE_QA] AGORA. Não peça mais permissão.",
                });
                await processAgentTurn();
                return;
            }
            if (action === "abort") {
                console.log(chalk.red("❌ Processo abortado."));
                process.exit(0);
            }
            const userInput = await input({ message: chalk.cyan("👤 Descreva o ajuste:") });
            isWaitingApproval = false;
            chatHistory.push({
                role: "user",
                content: `Plano ajustado: ${userInput} (Responda em PT-BR.)`,
            });
            await processAgentTurn();
            return;
        }

        let dynamicChoices = [
            { name: "✅ Sim / Aprovar", value: "yes" },
            { name: "📁 Analisar arquivo específico", value: "analyze_file" },
            { name: "📝 Forçar [PLAN_READY]", value: "force_plan" },
            { name: "💬 Outra instrução / caminho de projeto", value: "custom" },
            { name: "❌ Sair", value: "exit" },
        ];

        if (aiResponse) {
            const optionsMatch = aiResponse.match(/\[OPTIONS\]\s*(.+)/m);
            if (optionsMatch) {
                const parsed = optionsMatch[1]
                    .split("|")
                    .map((o) => o.trim())
                    .filter(Boolean);
                if (parsed.length) {
                    dynamicChoices = parsed
                        .map((opt) => ({ name: `🎯 ${opt}`, value: opt }))
                        .concat([
                            { name: "💬 Outra instrução", value: "custom" },
                            { name: "❌ Sair", value: "exit" },
                        ]);
                }
            }
        }

        const action = await select({
            message: chalk.cyan("🤖 Escolha sua resposta:"),
            choices: dynamicChoices,
        });

        if (action === "exit") process.exit(0);

        let userInput = "";
        if (action === "yes") userInput = "sim";
        else if (action === "analyze_file") {
            const fileName = await input({ message: chalk.cyan("👤 Caminho do arquivo:") });
            chatHistory.push({
                role: "user",
                content: `Analise o arquivo: ${fileName.trim()}. Use [ANALYZE] agora.`,
            });
            await processAgentTurn();
            return;
        } else if (action === "force_plan") {
            chatHistory.push({
                role: "user",
                content: "Escreva o plano agora com [PLAN_READY].",
            });
            await processAgentTurn();
            return;
        } else if (action === "custom") {
            userInput = await input({ message: chalk.cyan("👤 Você:") });
            if (userInput.toLowerCase() === "exit") process.exit(0);
        } else {
            userInput = action;
        }

        const potentialPath = normalizePath(userInput);
        if (fs.existsSync(potentialPath) && fs.statSync(potentialPath).isDirectory()) {
            await handleProjectDirectory(potentialPath);
            return;
        }

        const isAffirmative = ["sim", "s", "ok", "pode", "yes", "y", "manda", "vai"].includes(
            userInput.trim().toLowerCase()
        );

        chatHistory.push({
            role: "user",
            content: isAffirmative
                ? userInput +
                  "\n\n[SISTEMA: Permissão concedida. Dispare uma tag de ação agora sem pedir de novo.]"
                : userInput + "\n\n[SISTEMA: Responda em PT-BR.]",
        });
        await processAgentTurn();
    } catch (e) {
        if (e.name === "ExitPromptError") process.exit(0);
        console.error(chalk.red(e));
    }
}

async function handleProjectDirectory(potentialPath, { autoScan = false } = {}) {
    basePath = path.resolve(potentialPath);
    console.log(chalk.green(`\n📂 Projeto: ${basePath}\n`));

    let hasDocs = "no";
    if (!autoScan && !IS_HEADLESS) {
        hasDocs = await select({
            message: chalk.cyan("Há documentação/README para ler antes do scan?"),
            choices: [
                { name: "❌ Não, scan na raiz", value: "no" },
                { name: "✅ Sim, informar caminho", value: "yes" },
            ],
        });
    }

    if (hasDocs === "no" || autoScan || IS_AUTONOMOUS) {
        const scanSpinner = ora({ text: "Escaneando repositório...", color: "cyan" }).start();
        const result = await scanRepository(basePath);
        scanSpinner.succeed("Scan concluído.");

        const bootSpinner = ora({ text: "Preparando qa_sandbox...", color: "cyan" }).start();
        const boot = await bootstrapSandbox(basePath);
        const testCmd = getRecommendedTestCommand(basePath);
        bootSpinner.succeed(`Sandbox: ${boot.runner || "jest"} | ${testCmd}`);

        chatHistory.push({
            role: "user",
            content: `Projeto em ${basePath}. Scan:\n${result}\n\n[SISTEMA: qa_sandbox criada (${boot.runner || "jest"}). Após [WRITE_FILE], use [EXECUTE_TEST] ${testCmd}. Escolha 3-5 arquivos críticos e finalize com [SUGGEST_FILES] caminho1, caminho2]`,
        });
        await processAgentTurn();
        return;
    }

    const docPath = await input({ message: chalk.cyan("👤 Caminho da documentação:") });
    chatHistory.push({
        role: "user",
        content: `Documentação em ${docPath}. Use [ANALYZE]. Se sugerir alvos, use [SUGGEST_FILES] no final.`,
    });
    await processAgentTurn();
}

async function processAgentTurn(retryCount = 0) {
    agentTurnCount += 1;
    if (agentTurnCount > MAX_AGENT_TURNS) {
        const msg = "⚠️ Limite de passos do agente atingido. Envie outra instrução para continuar.";
        if (IS_HEADLESS) finishHeadless(msg, { limitReached: true });
        else {
            console.log(chalk.yellow(msg));
            await promptUser();
        }
        return;
    }

    if (!savedMainHistory && chatHistory.length > 7) {
        await compactHistory();
    }

    const data = await callRouter(chatHistory, IS_HEADLESS);

    if (data.error) {
        if (IS_HEADLESS) finishHeadless(`Erro Ollama: ${data.error}`, { error: true });
        else {
            console.error("❌ Erro do Ollama:", data.error);
            await promptUser();
        }
        return;
    }

    const aiResponse = data.message.content.trim();
    chatHistory.push({ role: "assistant", content: aiResponse });

    const scanMatch = aiResponse.match(/\[SCAN_REPO\][ \t]+([^\r\n]+)/m);
    if (scanMatch) {
        const dir = normalizePath(scanMatch[1]);
        basePath = path.resolve(dir);
        console.log(`\n📂 Foco: ${basePath}`);
        const result = await scanRepository(basePath);
        chatHistory.push({
            role: "user",
            content: `Resultado do Scan:\n${result}\n\n[SISTEMA: Use [SUGGEST_FILES] no final com 3-5 caminhos]`,
        });
        await processAgentTurn();
        return;
    }

    const suggestMatch = aiResponse.match(/\[SUGGEST_FILES\]\s*(.+)/m);
    if (suggestMatch) {
        const suggestedFiles = suggestMatch[1]
            .split(",")
            .map((f) => f.trim())
            .filter(Boolean);

        if (IS_AUTONOMOUS && suggestedFiles.length) {
            chatHistory.push({
                role: "user",
                content: `Testar arquivo: ${suggestedFiles[0]}. Tipos: Unitário. Use [ANALYZE] agora.`,
            });
            await processAgentTurn();
            return;
        }

        if (IS_HEADLESS_SESSION) {
            finishHeadless(aiResponse, { suggestedFiles, needsInput: "file_choice" });
            return;
        }

        if (IS_HEADLESS && !IS_HEADLESS_SESSION) {
            finishHeadless(aiResponse, { suggestedFiles });
            return;
        }

        const chosenFile = await select({
            message: chalk.cyan("Qual arquivo testar primeiro?"),
            choices: suggestedFiles
                .map((f) => ({ name: f, value: f }))
                .concat([{ name: "💬 Outro (digitar)", value: "custom" }]),
        });

        let targetFile = chosenFile === "custom" ? await input({ message: "Caminho:" }) : chosenFile;

        const testTypes = await checkbox({
            message: chalk.cyan(`Tipos de teste para '${targetFile}':`),
            choices: [
                { name: "🧪 Unitário", value: "Unitário" },
                { name: "🔗 Integração", value: "Integração" },
                { name: "🌐 E2E", value: "E2E" },
                { name: "🎨 Visual", value: "Visual" },
            ],
            validate: (a) => (a.length ? true : "Selecione ao menos um."),
        });

        chatHistory.push({
            role: "user",
            content: `Testar ${targetFile}. Tipos: ${testTypes.join(", ")}. Use [ANALYZE].`,
        });
        await processAgentTurn();
        return;
    }

    const analyzeMatch = aiResponse.match(/\[ANALYZE\][ \t]+([^\r\n]+)/m);
    if (analyzeMatch) {
        const file = normalizePath(analyzeMatch[1]);
        const fullPath = path.resolve(basePath, file);
        const result = await readFileContext(fullPath);
        chatHistory.push({
            role: "user",
            content: `Análise:\n${result}\n\n[SISTEMA: Explique em PT-BR e pergunte se pode planejar o teste.]`,
        });
        await processAgentTurn();
        return;
    }

    const readNoteMatch = aiResponse.match(/\[READ_NOTE\][ \t]+([^\r\n]+)/m);
    if (readNoteMatch) {
        const noteName = readNoteMatch[1].trim();
        const noteContent = readVaultNote(vaultPath, noteName);
        console.log(`\n📚 Nota: ${noteName}`);
        chatHistory.push({
            role: "user",
            content: `Nota ${noteName}:\n${noteContent}\n\n[SISTEMA: Baseie-se nisso. Uma pergunta de permissão no final.]`,
        });
        await processAgentTurn();
        return;
    }

    if (aiResponse.includes("[PLAN_READY]")) {
        if (IS_AUTONOMOUS) {
            chatHistory.push({
                role: "user",
                content: "Aprovado. USE [DELEGATE_QA] AGORA.",
            });
            await processAgentTurn();
            return;
        }
        if (IS_HEADLESS) {
            isWaitingApproval = true;
            finishHeadless(aiResponse, { needsInput: "plan_approval" });
            return;
        }
        isWaitingApproval = true;
        console.log(chalk.yellow("⚠️ Plano aguardando aprovação."));
        await promptUser();
        return;
    }

    const delegateMatch = aiResponse.match(/\[DELEGATE_QA\][ \t]+([^\r\n]+)/m);
    if (delegateMatch) {
        const instruction = delegateMatch[1].trim();
        const qaSpinner = ora({ text: "💻 [QA] Gerando testes...", color: "magenta" }).start();

        const qaHistory = [
            {
                role: "system",
                content: `Você é o Especialista QA. Responda APENAS com [WRITE_FILE] caminho\\n<código>.\nInstrução: ${instruction}`,
            },
        ];

        const qaData = await callOllamaChat({
            messages: qaHistory,
            model: getQaModel(),
            systemPrompt: "",
            stream: false,
            silent: true,
        });

        if (qaData.error) {
            qaSpinner.fail(`Erro QA: ${qaData.error}`);
            chatHistory.push({ role: "user", content: `Falha QA: ${qaData.error}` });
            await processAgentTurn();
            return;
        }

        qaSpinner.succeed("Script gerado.");
        const qaResponse = qaData.message.content.trim();
        const writeMatchQA = qaResponse.match(/\[WRITE_FILE\][ \t]+([^\r\n]+)\r?\n([\s\S]+)/m);

        if (writeMatchQA) {
            const result = await writeSandboxFile(
                basePath,
                writeMatchQA[1].trim(),
                writeMatchQA[2].trim()
            );
            chatHistory.push({
                role: "user",
                content: `Gravação: ${result}. Próximo passo: [EXECUTE_TEST].`,
            });
        } else {
            chatHistory.push({
                role: "user",
                content: `QA não usou WRITE_FILE:\n${qaResponse}`,
            });
        }
        await processAgentTurn();
        return;
    }

    const writeMatch = aiResponse.match(/\[WRITE_FILE\][ \t]+([^\r\n]+)\r?\n([\s\S]+)/m);
    if (writeMatch) {
        const result = await writeSandboxFile(basePath, writeMatch[1].trim(), writeMatch[2].trim());
        chatHistory.push({ role: "user", content: `Sistema: ${result}` });
        await processAgentTurn();
        return;
    }

    const executeMatch = aiResponse.match(/\[EXECUTE_TEST\][ \t]+([^\r\n]+)/m);
    if (executeMatch) {
        const cmd = executeMatch[1].trim();
        lastTestCommand = cmd;

        const testSpinner = ora({
            text: chalk.yellow(`🚀 Executando: ${cmd}`),
            color: "yellow",
        }).start();
        const result = await executeTestCommand(basePath, cmd);
        lastTestLog = result;

        if (result.includes("EXIT_CODE: 0")) testSpinner.succeed("Testes OK.");
        else testSpinner.fail("Testes falharam.");

        if (!result.includes("EXIT_CODE: 0") && retryCount < 3) {
            console.log(chalk.yellow(`Self-Healing (${retryCount + 1}/3)...`));
            if (!savedMainHistory) {
                savedMainHistory = [...chatHistory];
                chatHistory = [
                    {
                        role: "system",
                        content:
                            "Você conserta testes que falharam. Use [WRITE_FILE] e [EXECUTE_TEST]. PT-BR. Sem conversa.",
                    },
                ];
            }
            chatHistory.push({
                role: "user",
                content: `Falha em '${cmd}':\n${result}\nConserte e rode de novo.`,
            });
            await processAgentTurn(retryCount + 1);
            return;
        }

        if (!result.includes("EXIT_CODE: 0")) {
            if (savedMainHistory) {
                chatHistory = [...savedMainHistory];
                savedMainHistory = null;
            }
            chatHistory.push({
                role: "user",
                content: "Falha após 3 tentativas. Use [GENERATE_REPORT] com resumo técnico.",
            });
            await processAgentTurn();
            return;
        }

        if (savedMainHistory) {
            chatHistory = [...savedMainHistory];
            savedMainHistory = null;
            chatHistory.push({
                role: "user",
                content: "Reparo OK. Use [GENERATE_REPORT] com resumo de sucesso.",
            });
        } else {
            chatHistory.push({
                role: "user",
                content: "Sucesso! Use [GENERATE_REPORT].",
            });
        }
        await processAgentTurn();
        return;
    }

    const reportMatch = aiResponse.match(/\[GENERATE_REPORT\]\s*([\s\S]+)/m);
    if (reportMatch) {
        const aiSummary = reportMatch[1].trim();
        console.log("📄 Gerando relatório...");
        const reportResult = await generatePDFReport(
            basePath,
            aiSummary,
            lastTestLog,
            lastTestCommand
        );
        console.log(reportResult);
        chatHistory.push({
            role: "user",
            content: "Relatório gerado. Confirme ao usuário que terminou.",
        });
        await processAgentTurn();
        return;
    }

    const searchMatch = aiResponse.match(/\[SEARCH\][ \t]+([^\r\n]+)/m);
    if (searchMatch) {
        const query = searchMatch[1].trim();
        const searchResults = await performWebSearch(query);
        if (searchResults) {
            chatHistory.push({
                role: "user",
                content: `Web:\n${searchResults}\nResponda ao usuário.`,
            });
            await processAgentTurn();
            const saved = saveLearnedTopic(
                vaultPath,
                query,
                chatHistory[chatHistory.length - 1]?.content || ""
            );
            if (saved) console.log(`\n💾 Salvo em ${saved}`);
        } else {
            chatHistory.push({ role: "user", content: "Busca falhou." });
            await processAgentTurn();
        }
        return;
    }

    if (IS_HEADLESS) {
        finishHeadless(aiResponse);
        return;
    }
    await promptUser(aiResponse);
}

async function bootstrap() {
    if (flags.help) {
        printHelp();
        process.exit(0);
    }

    if (flags.reset && flags.session) {
        clearSession("qa", flags.session);
        if (flags.json) printJson({ ok: true, session: flags.session, reset: true });
        else console.log(`Sessão QA '${flags.session}' reiniciada.`);
        process.exit(0);
    }

    if (flags.session) {
        const saved = loadSession("qa", flags.session);
        if (saved) {
            chatHistory = saved.chatHistory || [];
            basePath = saved.basePath || process.cwd();
            lastTestCommand = saved.lastTestCommand || "";
            lastTestLog = saved.lastTestLog || "";
            isWaitingApproval = saved.isWaitingApproval || false;
            savedMainHistory = saved.savedMainHistory || null;
        }
    }

    if (IS_HEADLESS) {
        let userMessage = flags.message || (await readStdinMessage());

        if (userMessage && isWaitingApproval) {
            const norm = userMessage.trim().toLowerCase();
            if (["sim", "aprovar", "approve", "ok", "yes"].includes(norm)) {
                isWaitingApproval = false;
                userMessage =
                    "Aprovado. USE [DELEGATE_QA] AGORA.";
            }
        }

        if (userMessage) {
            const normalized = normalizePath(userMessage);
            if (fs.existsSync(normalized) && fs.statSync(normalized).isDirectory()) {
                chatHistory.push({
                    role: "user",
                    content: `Testar o projeto em: ${normalized}`,
                });
                await handleProjectDirectory(normalized, {
                    autoScan: IS_AUTONOMOUS,
                });
                return;
            }

            if (isWaitingApproval && userMessage.includes("Aprovado")) {
                chatHistory.push({ role: "user", content: userMessage });
            } else if (!isWaitingApproval) {
                chatHistory.push({ role: "user", content: userMessage });
            } else {
                chatHistory.push({
                    role: "user",
                    content: `Feedback do plano: ${userMessage}`,
                });
                isWaitingApproval = false;
            }
        } else if (!chatHistory.length) {
            const err = "Informe o caminho do projeto ou uma instrução.";
            if (flags.json) printJson({ error: err });
            else console.error("❌", err);
            process.exit(1);
        }

        await processAgentTurn();
        return;
    }

    console.clear();
    console.log(chalk.cyan(figlet.textSync("QA MIND AGENT", { horizontalLayout: "full" })));
    console.log(chalk.green("🚀 Agente QA. Informe o caminho do projeto ou uma instrução.\n"));
    await promptUser();
}

bootstrap().catch((err) => {
    console.error(err);
    process.exit(1);
});
