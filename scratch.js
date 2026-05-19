import fs from 'fs';
import path from 'path';

function loadVaultContext(vaultPath) {
    let contextText = '';
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

    return contextText.length;
}
console.log(loadVaultContext('/Users/ovinileme/Documents/Repo/Personal/QA Mind'));
