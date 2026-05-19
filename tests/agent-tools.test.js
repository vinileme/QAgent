import fs from 'fs';
import path from 'path';
import { scanRepository, readFileContext, writeSandboxFile, executeTestCommand } from '../agent-tools.js';

// Setup Mock Directory Structure for tests
const TEST_DIR = path.join(process.cwd(), 'tests', 'mock_repo');

beforeAll(() => {
    if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
    
    // Create valid file
    fs.writeFileSync(path.join(TEST_DIR, 'valid_file.js'), 'console.log("Hello");');
    
    // Create ignored folder
    const nodeModules = path.join(TEST_DIR, 'node_modules');
    if (!fs.existsSync(nodeModules)) fs.mkdirSync(nodeModules);
    fs.writeFileSync(path.join(nodeModules, 'ignored_file.js'), 'ignore me');
});

afterAll(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('Agent Tools', () => {

    describe('scanRepository', () => {
        it('deve retornar erro para diretório inexistente', async () => {
            const result = await scanRepository('/path/fake/inexistente');
            expect(result).toContain('ERRO');
        });

        it('deve listar arquivos válidos ignorando node_modules', async () => {
            const result = await scanRepository(TEST_DIR);
            expect(result).toContain('valid_file.js');
            expect(result).not.toContain('ignored_file.js');
        });
    });

    describe('readFileContext', () => {
        it('deve retornar erro EISDIR amigável se tentar ler um diretório', async () => {
            const result = await readFileContext(TEST_DIR);
            expect(result).toContain('é um DIRETÓRIO');
            expect(result).toContain('[ANALYZE]');
            expect(result).toContain('[SCAN_REPO]');
        });

        it('deve ler o conteúdo de um arquivo existente', async () => {
            const filePath = path.join(TEST_DIR, 'valid_file.js');
            const result = await readFileContext(filePath);
            expect(result).toBe('console.log("Hello");');
        });

        it('deve retornar erro para arquivo inexistente', async () => {
            const result = await readFileContext(path.join(TEST_DIR, 'fake.js'));
            expect(result).toContain('não encontrado');
        });
    });

    describe('writeSandboxFile', () => {
        it('deve criar a qa_sandbox e gravar o arquivo corretamente', async () => {
            const result = await writeSandboxFile(TEST_DIR, 'test.js', '// Test content');
            expect(result).toContain('SUCESSO');
            
            const sandboxFile = path.join(TEST_DIR, 'qa_sandbox', 'test.js');
            expect(fs.existsSync(sandboxFile)).toBe(true);
            expect(fs.readFileSync(sandboxFile, 'utf-8')).toBe('// Test content');
        });
    });
});
