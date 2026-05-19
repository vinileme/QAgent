import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import readline from "readline";
import { scanRepository, readFileContext, writeSandboxFile, executeTestCommand } from "./agent-tools.js";
import { generatePDFReport } from "./reporter.js";

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

function loadVaultContext(vaultPath) {
    let contextText = `Você é o JARVINIS, o Líder de QA Autônomo.
Sua missão é guiar o usuário na criação de testes passo a passo, SEMPRE em Português do Brasil.

### FLUXO DE TRABALHO OBRIGATÓRIO (PASSO A PASSO):
Quando o usuário fornecer o caminho de um projeto, você NÃO DEVE explicar o que é o projeto. Inicie o diálogo guiado:
1. Responda: "Caminho recebido. Você tem o link da documentação ou README que eu deva ler antes de iniciar? Se não tiver, me avise e o sistema fará o escaneamento da pasta raiz."
2. Se ele disser que não tem documentação, O PRÓPRIO SISTEMA (Node.js) fará o scan automático em background e enviará o resultado da árvore de arquivos para você na próxima mensagem. VOCÊ NÃO PRECISA USAR A TAG [SCAN_REPO] NESSA HORA.
3. Quando você receber o "Resultado do Scan", analise os arquivos e sugira ao usuário o próximo passo (ex: "Achei o arquivo X interessante, deseja que eu use a tag [ANALYZE] nele?").

### REGRAS CRÍTICAS DE IDIOMA E AÇÃO:
- **TRADUÇÃO OBRIGATÓRIA:** Se você analisar um código ou documentação em Inglês, você deve OBRIGATORIAMENTE traduzir a sua explicação e os seus comentários para Português do Brasil. NUNCA responda em Inglês.
- **TESTES 100% OBSIDIAN:** Ao planejar automações, baseie-se EXCLUSIVAMENTE nas notas abaixo.
- **TAGS DE AÇÃO (TOOL CALLING):** Para avançar, use uma destas tags isoladas em uma linha:
   - "[SCAN_REPO] <caminho_da_pasta>": Inicia a varredura.
   - "[ANALYZE] <caminho_do_arquivo>": Lê o código fonte.
   - "[READ_NOTE] <nome_do_arquivo.md>": Lê o conteúdo de uma nota do seu Obsidian para aprender como fazer um teste específico.
   - "[PLAN_READY]": Solicita aprovação final do plano.
   - "[WRITE_FILE] <caminho> \\n <codigo>": Grava o script na qa_sandbox.
   - "[EXECUTE_TEST] <comando>": Executa o teste.
   - "[GENERATE_REPORT] \\n <resumo executivo>": Gera o PDF final.

### NOTAS DO COFRE QA MIND (OBSIDIAN) DISPONÍVEIS:
(Consulte-as com [READ_NOTE] antes de planejar qualquer arquitetura de teste)
`;

    const targetFolders = [
        "TECH_Topics",
        "Architecture_Topics",
        "CT-AI_Topics",
        "Value_Topics",
        "Learned_Topics"
    ];

    targetFolders.forEach(folder => {
        const fullPath = path.join(vaultPath, folder);
        if (fs.existsSync(fullPath)) {
            const files = fs.readdirSync(fullPath).filter(f => f.endsWith('.md'));
            files.forEach(file => {
                contextText += `- ${file}\n`;
            });
        }
    });

    return contextText;
}

const systemContext = loadVaultContext(process.env.OBSIDIAN_VAULT_PATH);
let chatHistory = [];
let savedMainHistory = null; // Memória principal guardada quando em Clean Room

async function callOllamaChat(messages) {
    const payload = {
        model: process.env.OLLAMA_MODEL,
        messages: [
            { role: "system", content: systemContext },
            ...messages
        ],
        stream: true // MUDANÇA: Habilitado o streaming em tempo real
    };

    // Barra de evolução / Spinner manual
    const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    const spinner = setInterval(() => {
        process.stdout.write(`\r\x1b[K${spinnerFrames[i]} JARVINIS está processando os dados e raciocinando...`);
        i = (i + 1) % spinnerFrames.length;
    }, 100);

    try {
        const response = await fetch(`${process.env.OLLAMA_HOST}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        clearInterval(spinner);
        process.stdout.write("\r\x1b[K🤖 JARVINIS:\n"); // Limpa o spinner

        // Lê o stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullContent = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(l => l.trim() !== '');
            
            for (const line of lines) {
                try {
                    const json = JSON.parse(line);
                    if (json.message && json.message.content) {
                        fullContent += json.message.content;
                        process.stdout.write(json.message.content); // Imprime em tempo real
                    }
                } catch (e) {
                    // Ignora erros de parse de chunks parciais se houver
                }
            }
        }
        console.log("\n");
        return { message: { content: fullContent } };
    } catch (error) {
        clearInterval(spinner);
        return { error: error.message };
    }
}

async function performWebSearch(query) {
    try {
        console.log(`\n🔍 Buscando na Wikipedia por: "${query}"...`);
        const searchRes = await fetch(`https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json`);
        const searchData = await searchRes.json();
        if (!searchData.query.search || searchData.query.search.length === 0) return null;
        
        const bestTitle = searchData.query.search[0].title;
        const extractRes = await fetch(`https://pt.wikipedia.org/w/api.php?action=query&prop=extracts&exsentences=5&exlimit=1&titles=${encodeURIComponent(bestTitle)}&explaintext=1&format=json`);
        const extractData = await extractRes.json();
        const pages = extractData.query.pages;
        const extract = pages[Object.keys(pages)[0]].extract;
        
        return extract ? `Fonte: Wikipedia (${bestTitle})\n${extract}` : null;
    } catch (error) {
        return null;
    }
}

// Configuração do Chat CLI
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let basePath = process.cwd();
let isWaitingApproval = false;
let pendingScanDir = null; // Armazena o caminho do projeto até ter a resposta sobre a documentação
let lastTestCommand = "";
let lastTestLog = "";

console.log("🚀 JARVINIS Agentic QA Iniciado. Qual projeto vamos testar hoje?\n");

function promptUser() {
    rl.question("👤 Você: ", async (userInput) => {
        if (userInput.toLowerCase() === 'exit') {
            rl.close();
            return;
        }

        // 1. HARDCODED ROUTING: Se o usuário colou um caminho de diretório
        if (fs.existsSync(userInput.trim()) && fs.statSync(userInput.trim()).isDirectory()) {
            pendingScanDir = userInput.trim();
            console.log(`\n🤖 JARVINIS:\nCaminho reconhecido. Você tem o link da documentação ou um arquivo README específico que eu deva ler antes de testar? Se não tiver, responda 'não' e eu escanearei a pasta raiz.\n`);
            promptUser();
            return;
        }

        // 2. HARDCODED ROUTING: Resposta sobre a documentação
        const normalizedInput = userInput.trim().toLowerCase();
        const isNegative = ['não', 'nao', 'n', 'nop', 'no'].includes(normalizedInput);
        
        if (pendingScanDir && isNegative) {
            console.log(`\n🤖 JARVINIS:\nEntendido. Iniciando varredura do projeto...`);
            const dir = pendingScanDir;
            pendingScanDir = null; // reseta
            basePath = path.resolve(dir);
            console.log(`📂 Foco alterado para o projeto externo: ${basePath}`);
            const result = await scanRepository(basePath);
            chatHistory.push({ role: "user", content: `O usuário confirmou que não há documentação. O resultado do SCAN_REPO é:\n${result}\n\n(Regra do Sistema: FALE APENAS EM PORTUGUÊS PT-BR e diga o que você vai analisar a seguir usando a tag [ANALYZE] ou escreva um plano e use [PLAN_READY]).` });
            await processAgentTurn();
            return;
        } else if (pendingScanDir) {
            // Se ele deu o caminho de um README, por exemplo
            const docPath = userInput.trim();
            pendingScanDir = null; // reseta
            chatHistory.push({ role: "user", content: `A documentação do projeto está em: ${docPath}. Por favor, analise a documentação usando a tag [ANALYZE] e depois faça um [SCAN_REPO] na raiz.\n\n(Regra do Sistema: RESPONDA EM PORTUGUÊS PT-BR E TERMINE PERGUNTANDO SE PODE PROSSEGUIR).` });
            await processAgentTurn();
            return;
        }

        // Fluxo Normal (Human-in-the-loop)
        if (isWaitingApproval) {
            if (userInput.toLowerCase() === 's' || userInput.toLowerCase() === 'sim' || userInput.toLowerCase() === 'ok' || userInput.toLowerCase() === 'pode') {
                isWaitingApproval = false;
                chatHistory.push({ role: "user", content: "Aprovado. Prossiga com a escrita e execução. (Regra: Fale em Português PT-BR e coloque apenas UMA pergunta de confirmação no final do texto)." });
                await processAgentTurn();
            } else {
                isWaitingApproval = false;
                chatHistory.push({ role: "user", content: "Plano rejeitado/parado. " + userInput + " (Regra: Fale em Português PT-BR e coloque apenas UMA pergunta de confirmação no final do texto)." });
                await processAgentTurn();
            }
        } else {
            chatHistory.push({ role: "user", content: userInput + "\n\n[MENSAGEM DO SISTEMA: Responda obrigatoriamente em PT-BR. NUNCA faça perguntas no meio do texto. Adicione apenas UMA pergunta curta pedindo permissão no final exato da sua resposta (ex: 'Posso continuar?').]" });
            await processAgentTurn();
        }
    });
}

async function processAgentTurn(retryCount = 0) {
    // PROTEÇÃO CONTRA ESTOURO DE MEMÓRIA (Context Loss)
    // Mantém sempre a primeira mensagem (System Prompt) e os últimos 6 diálogos
    // Não fatia o histórico se estiver na Câmara Limpa (Clean Room possui prompt único curto)
    if (!savedMainHistory && chatHistory.length > 7) {
        chatHistory = [chatHistory[0], ...chatHistory.slice(-6)];
    }

    const data = await callOllamaChat(chatHistory);

    if (data.error) {
        console.error("❌ Erro do Ollama:", data.error);
        promptUser();
        return;
    }

    const aiResponse = data.message.content.trim();
    chatHistory.push({ role: "assistant", content: aiResponse });

    // Máquina de Estados Baseada em Tags (Tool Interceptor)
    
    // 1. SCAN_REPO
    const scanMatch = aiResponse.match(/\[SCAN_REPO\]\s*([\w\.\/\-]+)/);
    if (scanMatch) {
        const dir = scanMatch[1].trim();
        basePath = path.resolve(dir); // Atualiza o diretório alvo para a pasta externa informada
        console.log(`\n📂 Foco alterado para o projeto externo: ${basePath}`);
        const result = await scanRepository(basePath);
        chatHistory.push({ role: "user", content: `Resultado do Scan:\n${result}\n\n[MENSAGEM DO SISTEMA: Comunique ao usuário os principais pontos que encontrou OBRIGATORIAMENTE EM PT-BR. No final exato da sua frase, faça UMA pergunta curta perguntando qual o próximo passo (ex: 'Deseja que eu analise algum arquivo específico?')]` });
        await processAgentTurn();
        return;
    }

    // 2. ANALYZE
    const analyzeMatch = aiResponse.match(/\[ANALYZE\]\s*([\w\.\/\-]+)/);
    if (analyzeMatch) {
        const file = analyzeMatch[1].trim();
        const fullPath = path.resolve(basePath, file); // Garante que o caminho é relativo à pasta alvo
        const result = await readFileContext(fullPath);
        chatHistory.push({ role: "user", content: `Resultado da Análise:\n${result}\n\n[MENSAGEM DO SISTEMA: Explique em PT-BR o que entendeu do código. Termine pedindo instrução ao usuário (ex: 'Podemos planejar o teste?')]` });
        await processAgentTurn();
        return;
    }

    // 2.5 READ_NOTE (Agentic RAG)
    const readNoteMatch = aiResponse.match(/\[READ_NOTE\]\s*([\w\.\/\-\s]+)/);
    if (readNoteMatch) {
        const noteName = readNoteMatch[1].trim();
        let noteContent = "Nota não encontrada no Obsidian.";
        const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
        const targetFolders = ["TECH_Topics", "Architecture_Topics", "CT-AI_Topics", "Value_Topics", "Learned_Topics"];
        
        for (const folder of targetFolders) {
            const fullPath = path.join(vaultPath, folder, noteName);
            if (fs.existsSync(fullPath)) {
                noteContent = fs.readFileSync(fullPath, 'utf-8');
                break;
            }
        }
        
        console.log(`\n📚 Consultando Cofre QA Mind: ${noteName}`);
        chatHistory.push({ role: "user", content: `Conteúdo da nota ${noteName}:\n${noteContent}\n\n[MENSAGEM DO SISTEMA: Baseie-se nisso. Adicione apenas UMA pergunta pedindo permissão no final exato da sua resposta (ex: 'Posso continuar?').]` });
        await processAgentTurn();
        return;
    }

    // 3. PLAN_READY (Human-in-the-loop)
    if (aiResponse.includes("[PLAN_READY]")) {
        isWaitingApproval = true;
        console.log("⚠️ O Agente gerou um plano e aguarda sua aprovação.");
        console.log("👉 Digite 'S' para aprovar ou dê o feedback da alteração.");
        promptUser();
        return;
    }

    // 4. WRITE_FILE
    // Regex blindado contra \r\n do Windows ou espaços invisíveis
    const writeMatch = aiResponse.match(/\[WRITE_FILE\]\s*([^\r\n]+)\r?\n([\s\S]+)/);
    if (writeMatch) {
        const file = writeMatch[1].trim();
        const content = writeMatch[2].trim();
        const result = await writeSandboxFile(basePath, file, content);
        chatHistory.push({ role: "user", content: `Resultado do Sistema: ${result}. Continue com a próxima ação se necessário.` });
        await processAgentTurn();
        return;
    }

    // 5. EXECUTE_TEST
    const executeMatch = aiResponse.match(/\[EXECUTE_TEST\]\s*(.+)/);
    if (executeMatch) {
        const cmd = executeMatch[1].trim();
        lastTestCommand = cmd;
        const result = await executeTestCommand(basePath, cmd);
        lastTestLog = result;
        
        console.log(`\n📊 Logs de Execução Capturados.`);

        // Self-Healing com Swapping de Memória (Clean Room)
        if (!result.includes("EXIT_CODE: 0") && retryCount < 3) {
            console.log(`⚠️ Falha detectada. Iniciando Self-Healing no Agente de Reparo Isolado (Tentativa ${retryCount + 1}/3)...`);
            
            // Entrando no Clean Room: Salva o histórico principal, se ainda não estivermos lá
            if (!savedMainHistory) {
                savedMainHistory = [...chatHistory];
                chatHistory = [
                    { 
                        role: "system", 
                        content: `Você é um Agente de QA especializado exclusivamente em consertar testes automatizados que falharam.\nVocê está em um ambiente isolado. Não explique nada, não pessa desculpas. Apenas analise os arquivos envolvidos usando [ANALYZE], escreva o código corrigido com a tag [WRITE_FILE] e tente executar novamente usando [EXECUTE_TEST]. Apenas isso.\nSua resposta DEVE ser OBRIGATORIAMENTE em PT-BR.`
                    }
                ];
            }

            chatHistory.push({ 
                role: "user", 
                content: `O comando '${cmd}' falhou com o seguinte log bruto de terminal:\n\n${result}\n\nPor favor, conserte o código e rode [EXECUTE_TEST] novamente.` 
            });
            await processAgentTurn(retryCount + 1);
            return;
        } else if (!result.includes("EXIT_CODE: 0")) {
            console.log(`❌ Self-Healing esgotou as tentativas.`);
            // Sai do Clean Room: Restaura a memória principal
            if (savedMainHistory) {
                chatHistory = [...savedMainHistory];
                savedMainHistory = null;
            }
            chatHistory.push({ role: "user", content: `A execução falhou nas 3 tentativas de Self-Healing. Os testes foram finalizados com falha. Por favor, analise a falha geral e acione a tag [GENERATE_REPORT] passando um Executive Summary técnico do que aconteceu.` });
            await processAgentTurn();
            return;
        }

        console.log("✅ Teste Passou!");
        
        // Se estava no Clean Room e teve sucesso, restaura a memória e avisa o principal
        if (savedMainHistory) {
            console.log("✅ Saindo do Clean Room. Devolvendo controle ao Agente Principal...");
            chatHistory = [...savedMainHistory];
            savedMainHistory = null;
            chatHistory.push({ role: "user", content: `Houve um erro no código, mas o nosso Agente de Reparo Isolado nos bastidores assumiu a bronca, consertou a falha, e a execução final foi bem sucedida!\n\nPor favor, acione a tag [GENERATE_REPORT] com o Executive Summary da automação e avise o usuário da vitória.` });
        } else {
            chatHistory.push({ role: "user", content: `Execução bem sucedida!\n\nPor favor, acione a tag [GENERATE_REPORT] com o Executive Summary da automação para finalizar.` });
        }
        
        await processAgentTurn();
        return;
    }

    // 6. GENERATE_REPORT
    const reportMatch = aiResponse.match(/\[GENERATE_REPORT\]\s*([\s\S]+)/);
    if (reportMatch) {
        const aiSummary = reportMatch[1].trim();
        console.log("📄 Gerando relatório executivo premium (PDF/HTML)...");
        const reportResult = await generatePDFReport(basePath, aiSummary, lastTestLog, lastTestCommand);
        console.log(reportResult);
        chatHistory.push({ role: "user", content: `O relatório foi gerado. Diga ao usuário que terminou a tarefa.` });
        await processAgentTurn();
        return;
    }

    // 6. SEARCH (General Web RAG)
    const searchMatch = aiResponse.match(/\[SEARCH\]\s*(.+)/);
    if (searchMatch) {
        const query = searchMatch[1].trim();
        const searchResults = await performWebSearch(query);

        if (searchResults) {
            console.log("📚 Estudando resultados da Web...");
            chatHistory.push({ role: "user", content: `Aqui estão os resultados da web:\n${searchResults}\nResponda ao usuário com base nisso.` });
            await processAgentTurn();
            
            // Salvar no Obsidian
            const learnedDir = path.join(process.env.OBSIDIAN_VAULT_PATH, "Learned_Topics");
            if (!fs.existsSync(learnedDir)) fs.mkdirSync(learnedDir, { recursive: true });
            const fileName = query.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".md";
            
            // Recupera a resposta final do assistant para salvar (a última inserida)
            const finalAnswer = chatHistory[chatHistory.length - 1].content;
            fs.writeFileSync(path.join(learnedDir, fileName), finalAnswer);
            console.log(`\n💾 Novo conhecimento salvo em: Learned_Topics/${fileName}`);
        } else {
            chatHistory.push({ role: "user", content: `A busca falhou. Responda que ainda não aprendeu sobre isso e não tem internet.` });
            await processAgentTurn();
        }
        return;
    }

    // Se não bateu com nenhuma tag e não é aprovação, apenas devolve o input pro usuário
    promptUser();
}

// Inicia o prompt na primeira vez
promptUser();