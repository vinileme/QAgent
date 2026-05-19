import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import google from "googlethis";

dotenv.config();

// Inicializa o cliente Antigravity / MCP
const agent = new Client({
    name: "antigravity-qa-coordinator",
    version: "1.0.0"
});

// Função para injetar as Notas Mestras como Contexto de Sistema (System Prompt)
function loadVaultContext(vaultPath) {
    let contextText = "Você é o JarVinis (uma combinação de Jarvis + Vini). Você é um funcionário virtual criado por Vini Leme.\n";
    contextText += "Sua função é atuar como Antigravity QA Coordinator. Suas diretrizes comportamentais e conhecimentos técnicos são baseados nas seguintes notas de engenharia.\n";
    contextText += "REGRA CRÍTICA: Você pode e deve responder livremente caso perguntem sobre quem você é (JarVinis, funcionário e criação de Vini Leme). Porém, se o usuário perguntar sobre QUALQUER OUTRO ASSUNTO que não esteja coberto nestas notas de engenharia, você DEVE responder EXATAMENTE o seguinte formato: \"[SEARCH] <termo da busca>\". Por exemplo: \"[SEARCH] Quem ganhou a copa do mundo de 2022\". Não tente inventar informações e não diga mais nada além da tag de busca.\n\n";

    // Pastas que criamos e queremos que o agente memorize
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
                const content = fs.readFileSync(path.join(fullPath, file), 'utf-8');
                contextText += `--- INÍCIO DA NOTA: ${file} ---\n${content}\n--- FIM DA NOTA ---\n\n`;
            });
        }
    });

    return contextText;
}

async function performWebSearch(query) {
    try {
        console.log(`\n🔍 Buscando informações para: "${query}"...`);
        
        // Passo 1: Buscar o melhor título na Wikipedia
        const searchRes = await fetch(`https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json`);
        const searchData = await searchRes.json();
        if (!searchData.query.search || searchData.query.search.length === 0) return null;
        
        const bestTitle = searchData.query.search[0].title;
        
        // Passo 2: Pegar o resumo do artigo
        const extractRes = await fetch(`https://pt.wikipedia.org/w/api.php?action=query&prop=extracts&exsentences=5&exlimit=1&titles=${encodeURIComponent(bestTitle)}&explaintext=1&format=json`);
        const extractData = await extractRes.json();
        const pages = extractData.query.pages;
        const extract = pages[Object.keys(pages)[0]].extract;
        
        return extract ? `Fonte: Wikipedia (${bestTitle})\n${extract}` : null;
    } catch (error) {
        console.error("❌ Erro na busca web:", error.message);
        return null;
    }
}

async function runAgent(userInput) {
    const systemContext = loadVaultContext(process.env.OBSIDIAN_VAULT_PATH);

    const callOllama = async (promptText) => {
        const response = await fetch(`${process.env.OLLAMA_HOST}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: process.env.OLLAMA_MODEL,
                system: systemContext,
                prompt: promptText,
                stream: false
            })
        });
        return await response.json();
    };

    console.log(`\n👤 User: ${userInput}`);
    const data = await callOllama(userInput);

    if (data.error) {
        console.error("❌ Erro do Ollama:", data.error);
        return;
    }

    const aiResponse = data.response.trim();


    // Verifica se a IA pediu para pesquisar
    if (aiResponse.includes("[SEARCH]")) {
        // Extrai apenas o termo de busca removendo a tag
        const query = aiResponse.replace(/\[SEARCH\]/g, "").trim();
        const searchResults = await performWebSearch(query);

        if (searchResults) {
            console.log("📚 Estudando resultados...");
            const learnPrompt = `O usuário perguntou: "${userInput}". Você não sabia, então pesquisou na web. Aqui estão os resultados da web:\n\n${searchResults}\n\nCom base nisso, responda ao usuário de forma clara e resumida. A sua resposta será salva como seu conhecimento definitivo sobre o assunto, então seja preciso.`;
            
            const learnData = await callOllama(learnPrompt);
            if (learnData.error) {
                console.error("❌ Erro ao processar aprendizado:", learnData.error);
                return;
            }

            const finalAnswer = learnData.response.trim();
            console.log("\n🤖 Antigravity Response (Aprendido da Web):\n", finalAnswer);

            // Salvar no Obsidian
            const learnedDir = path.join(process.env.OBSIDIAN_VAULT_PATH, "Learned_Topics");
            if (!fs.existsSync(learnedDir)) fs.mkdirSync(learnedDir, { recursive: true });
            
            const fileName = query.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".md";
            fs.writeFileSync(path.join(learnedDir, fileName), finalAnswer);
            console.log(`\n💾 Novo conhecimento salvo em: Learned_Topics/${fileName}`);

        } else {
            console.log("\n🤖 Antigravity Response:\n", "ainda não aprendi a falar sobre isso (e não consegui encontrar na web no momento).");
        }
    } else {
        console.log("\n🤖 Antigravity Response:\n", aiResponse);
    }
}

// Exemplo de execução: Simulando uma auditoria que você pediria no dia a dia
// Nota: agent.connect() exige um Transport (ex: StdioClientTransport). 
// Como o agente ainda não está usando o MCP para chamadas externas, vamos rodar o runAgent direto.
console.log("🚀 Iniciando Antigravity QA Coordinator (Ollama)...");

// Comando de teste para o agente
// runAgent("Analise o seguinte cenário: Nosso pipeline do Azure DevOps apresentou uma queda na frequência de deploy...");
runAgent("Quem foi o grande campeão da Copa do Mundo de Futebol Feminino de 2023?").catch(console.error);