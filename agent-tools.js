import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import {
    bootstrapSandbox,
    ensureSandboxReady,
    getRecommendedTestCommand,
} from './lib/sandbox-bootstrap.js';

const execPromise = util.promisify(exec);

// 1. Escaneia um repositório ignorando pastas pesadas
export async function scanRepository(dirPath) {
    console.log(`\n🔍 Escaneando diretório: ${dirPath}...`);
    try {
        if (!fs.existsSync(dirPath)) {
            return `ERRO: O diretório ${dirPath} não existe.`;
        }

        const ignoredDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'qa_sandbox'];
        
        function walkSync(currentDirPath, fileList = []) {
            const files = fs.readdirSync(currentDirPath);
            for (const file of files) {
                const fullPath = path.join(currentDirPath, file);
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory()) {
                    if (!ignoredDirs.includes(file)) {
                        walkSync(fullPath, fileList);
                    }
                } else {
                    fileList.push(fullPath);
                }
            }
            return fileList;
        }

        const allFiles = walkSync(dirPath);
        
        let tree = allFiles.slice(0, 60).map(f => f.replace(dirPath, '')).join('\n');
        if (allFiles.length > 60) {
            tree += `\n... e mais ${allFiles.length - 60} arquivos ocultados para economizar memória (se precisar ver algo específico, use ANALYZE).`;
        }
        
        return `Árvore de Arquivos Encontrada:\n${tree}`;
    } catch (error) {
        return `ERRO ao escanear o diretório: ${error.message}`;
    }
}

// 2. Lê um arquivo específico
export async function readFileContext(filePath) {
    console.log(`\n📖 Lendo arquivo: ${filePath}...`);
    try {
        if (!fs.existsSync(filePath)) {
            return `ERRO: Arquivo ${filePath} não encontrado.`;
        }
        
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            return `ERRO: "${filePath}" é um DIRETÓRIO. A tag [ANALYZE] só funciona em arquivos (ex: .js, .json). Se quiser ver o conteúdo dessa pasta, use a tag [SCAN_REPO] <caminho>.`;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        return content;
    } catch (error) {
        return `ERRO ao ler o arquivo: ${error.message}`;
    }
}

// 3. Garante que a sandbox existe e escreve o arquivo
export async function writeSandboxFile(basePath, relativeFilePath, content) {
    console.log(`\n💾 Escrevendo arquivo na Sandbox: ${relativeFilePath}...`);
    try {
        const sandboxDir = path.join(basePath, 'qa_sandbox');
        if (!fs.existsSync(sandboxDir)) {
            fs.mkdirSync(sandboxDir, { recursive: true });
        }

        const fullPath = path.join(sandboxDir, relativeFilePath);
        const dirName = path.dirname(fullPath);
        
        if (!fs.existsSync(dirName)) {
            fs.mkdirSync(dirName, { recursive: true });
        }

        fs.writeFileSync(fullPath, content);

        const boot = await bootstrapSandbox(basePath);
        const cmd = getRecommendedTestCommand(basePath);
        let extra = '';
        if (boot.message) extra += `\n${boot.message}`;
        extra += `\nComando sugerido para [EXECUTE_TEST]: ${cmd}`;

        return `SUCESSO: Arquivo salvo em qa_sandbox/${relativeFilePath}${extra}`;
    } catch (error) {
        return `ERRO ao escrever arquivo: ${error.message}`;
    }
}

// 4. Executa um comando na Sandbox
export async function executeTestCommand(basePath, command) {
    const sandboxDir = path.join(basePath, 'qa_sandbox');
    console.log(`\n🚀 Executando teste: [${command}] em ${sandboxDir}...`);
    
    if (!fs.existsSync(sandboxDir)) {
        return `ERRO: Diretório qa_sandbox não encontrado. Grave um teste primeiro.`;
    }

    const ready = await ensureSandboxReady(basePath);
    let setupNote = '';
    if (ready.bootstrap?.message) setupNote += `\n[SETUP] ${ready.bootstrap.message}`;
    if (ready.install?.success) setupNote += `\n[SETUP] ${ready.install.message}`;
    if (ready.install?.success === false) {
        setupNote += `\n[SETUP AVISO] ${ready.install.message}`;
    }

    const runCommand =
        command === 'npm test' || command === 'npm run test'
            ? ready.testCommand || command
            : command;

    try {
        const { stdout, stderr } = await execPromise(runCommand, {
            cwd: sandboxDir,
            timeout: 120000,
            env: { ...process.env, NODE_ENV: 'test' },
        });
        console.log(`✅ Execução concluída com sucesso.`);
        return `EXIT_CODE: 0${setupNote}\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`;
    } catch (error) {
        console.log(`❌ Execução falhou (Self-Healing ativado).`);
        return `EXIT_CODE: ${error.code}${setupNote}\n\nSTDOUT:\n${error.stdout || ''}\n\nSTDERR:\n${error.stderr || ''}\n\nERROR_MSG:\n${error.message}`;
    }
}

export { getRecommendedTestCommand, ensureSandboxReady, bootstrapSandbox };
