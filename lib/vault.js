import fs from "fs";
import path from "path";

export const VAULT_FOLDERS = [
    "TECH_Topics",
    "Architecture_Topics",
    "CT-AI_Topics",
    "Value_Topics",
    "Learned_Topics",
];

/** Frente 1: injeta o conteúdo completo das notas no system prompt. */
export function loadVaultFull(vaultPath) {
    let contextText =
        "Você é o JarVinis (Jarvis + Vini), assistente virtual criado por Vini Leme.\n" +
        "Atua como coordenador de QA e parceiro técnico. Responda em Português do Brasil, de forma clara e direta.\n" +
        "REGRA: Você pode falar sobre quem você é livremente. Para assuntos cobertos nas notas abaixo, use esse conhecimento.\n" +
        "Se o usuário perguntar algo que NÃO está nas notas e você não tiver certeza, responda APENAS com o formato exato:\n" +
        '[SEARCH] <termo da busca>\n' +
        "Não invente fatos. Não use tags de automação de QA ([SCAN_REPO], [DELEGATE_QA], etc.) neste modo de chat.\n\n";

    if (!vaultPath || !fs.existsSync(vaultPath)) {
        contextText += "(Cofre Obsidian não configurado ou inacessível.)\n";
        return contextText;
    }

    contextText += "### NOTAS DO COFRE QA MIND:\n\n";

    for (const folder of VAULT_FOLDERS) {
        const fullPath = path.join(vaultPath, folder);
        if (!fs.existsSync(fullPath)) continue;

        const files = fs.readdirSync(fullPath).filter((f) => f.endsWith(".md"));
        for (const file of files) {
            const content = fs.readFileSync(path.join(fullPath, file), "utf-8");
            contextText += `--- INÍCIO DA NOTA: ${file} ---\n${content}\n--- FIM DA NOTA ---\n\n`;
        }
    }

    return contextText;
}

/** Frente 2: lista apenas nomes de notas (RAG via [READ_NOTE]). */
export function loadVaultIndex(vaultPath) {
    let contextText = `Você é o JARVINIS, o Líder de QA Autônomo.
Sua missão é guiar o usuário na criação de testes passo a passo, SEMPRE em Português do Brasil.

### FLUXO DE TRABALHO OBRIGATÓRIO (PASSO A PASSO):
Quando o usuário fornecer o caminho de um projeto, você NÃO DEVE explicar o que é o projeto. Inicie o diálogo guiado:
1. Responda: "Caminho recebido. Você tem o link da documentação ou README que eu deva ler antes de iniciar? Se não tiver, me avise e o sistema fará o escaneamento da pasta raiz."
2. Se ele disser que não tem documentação, O PRÓPRIO SISTEMA (Node.js) fará o scan automático em background e enviará o resultado da árvore de arquivos para você na próxima mensagem. VOCÊ NÃO PRECISA USAR A TAG [SCAN_REPO] NESSA HORA.
3. Quando você receber o "Resultado do Scan", analise os arquivos e sugira ao usuário o próximo passo.

### REGRAS CRÍTICAS DE IDIOMA E AÇÃO:
- **TRADUÇÃO OBRIGATÓRIA:** Traduza explicações para Português do Brasil.
- **PERGUNTAS DIRECIONADAS:** Use [OPTIONS] opção1 | opção2 na última linha quando oferecer escolhas.
- **TESTES 100% OBSIDIAN:** Baseie-se nas notas listadas abaixo.
- **TAGS DE AÇÃO:** Use uma tag por linha quando for agir:
   - "[SCAN_REPO] <caminho>"
   - "[ANALYZE] <arquivo>"
   - "[READ_NOTE] <nota.md>"
   - "[DELEGATE_QA] <instruções>"
   - "[PLAN_READY]"
   - "[WRITE_FILE] <caminho>\\n<código>"
   - "[EXECUTE_TEST] npm test" (sandbox auto-configurada com Jest/Vitest/Playwright detectado no projeto)
   - "[GENERATE_REPORT]\\n<resumo>"

### NOTAS DO COFRE QA MIND (consulte com [READ_NOTE]):
`;

    if (!vaultPath || !fs.existsSync(vaultPath)) {
        return contextText + "(Vault não configurado.)\n";
    }

    for (const folder of VAULT_FOLDERS) {
        const fullPath = path.join(vaultPath, folder);
        if (!fs.existsSync(fullPath)) continue;
        const files = fs.readdirSync(fullPath).filter((f) => f.endsWith(".md"));
        for (const file of files) {
            contextText += `- ${file}\n`;
        }
    }

    return contextText;
}

export function readVaultNote(vaultPath, noteName) {
    if (!vaultPath) return "Nota não encontrada (vault não configurado).";

    for (const folder of VAULT_FOLDERS) {
        const fullPath = path.join(vaultPath, folder, noteName);
        if (fs.existsSync(fullPath)) {
            return fs.readFileSync(fullPath, "utf-8");
        }
    }
    return "Nota não encontrada no Obsidian.";
}

export function saveLearnedTopic(vaultPath, query, content) {
    if (!vaultPath) return null;

    const learnedDir = path.join(vaultPath, "Learned_Topics");
    if (!fs.existsSync(learnedDir)) fs.mkdirSync(learnedDir, { recursive: true });

    const fileName = query.replace(/[^a-z0-9]/gi, "_").toLowerCase() + ".md";
    const filePath = path.join(learnedDir, fileName);
    fs.writeFileSync(filePath, content);
    return `Learned_Topics/${fileName}`;
}
