import { jest } from '@jest/globals';

jest.unstable_mockModule('fs', () => ({
  default: {
    existsSync: jest.fn(),
    readdirSync: jest.fn(),
    statSync: jest.fn(),
    readFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
  }
}));

jest.unstable_mockModule('child_process', () => ({
  exec: jest.fn(),
}));

jest.unstable_mockModule('../lib/sandbox-bootstrap.js', () => ({
  bootstrapSandbox: jest.fn().mockResolvedValue({
    runner: 'jest',
    testCommand: 'npm test',
    message: 'Sandbox preparada',
  }),
  ensureSandboxReady: jest.fn().mockResolvedValue({
    testCommand: 'npm test',
    bootstrap: { message: 'ok' },
    install: { skipped: true },
  }),
  getRecommendedTestCommand: jest.fn().mockReturnValue('npm test'),
}));

const fs = (await import('fs')).default;
const { exec } = await import('child_process');
const { scanRepository, readFileContext, writeSandboxFile, executeTestCommand } = await import('../agent-tools.js');
import path from 'path';

describe('Agent Tools', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('scanRepository', () => {
        it('should return error if directory does not exist', async () => {
            fs.existsSync.mockReturnValue(false);
            const result = await scanRepository('/fake/dir');
            expect(result).toContain('ERRO: O diretório /fake/dir não existe.');
        });

        it('should return file tree and ignore node_modules', async () => {
            fs.existsSync.mockReturnValue(true);
            
            fs.readdirSync.mockImplementation((dir) => {
                if (dir === '/fake/dir') return ['src', 'node_modules', 'README.md'];
                if (dir === path.join('/fake/dir', 'src')) return ['index.js'];
                return [];
            });
            
            fs.statSync.mockImplementation((p) => {
                const isDir = p.endsWith('src') || p.endsWith('node_modules');
                return { isDirectory: () => isDir };
            });

            const result = await scanRepository('/fake/dir');
            
            expect(result).toContain('Árvore de Arquivos Encontrada:');
            expect(result).toContain('README.md');
            expect(result).toContain(path.join('src', 'index.js'));
            expect(result).not.toContain('node_modules');
        });
    });

    describe('readFileContext', () => {
        it('should return error if file does not exist', async () => {
            fs.existsSync.mockReturnValue(false);
            const result = await readFileContext('test.js');
            expect(result).toContain('ERRO: Arquivo test.js não encontrado');
        });

        it('should return error if path is a directory', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.statSync.mockReturnValue({ isDirectory: () => true });
            
            const result = await readFileContext('src');
            expect(result).toContain('é um DIRETÓRIO');
        });

        it('should read file content successfully', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.statSync.mockReturnValue({ isDirectory: () => false });
            fs.readFileSync.mockReturnValue('const a = 1;');
            
            const result = await readFileContext('test.js');
            expect(result).toBe('const a = 1;');
        });
    });

    describe('writeSandboxFile', () => {
        it('should write file recursively in qa_sandbox', async () => {
            fs.existsSync.mockReturnValue(false);
            
            const result = await writeSandboxFile('/base', 'tests/ui.spec.js', 'console.log("test")');
            
            expect(fs.mkdirSync).toHaveBeenCalledWith(path.join('/base', 'qa_sandbox'), { recursive: true });
            expect(fs.mkdirSync).toHaveBeenCalledWith(path.join('/base', 'qa_sandbox', 'tests'), { recursive: true });
            expect(fs.writeFileSync).toHaveBeenCalledWith(path.join('/base', 'qa_sandbox', 'tests', 'ui.spec.js'), 'console.log("test")');
            expect(result).toContain('SUCESSO');
        });
    });

    describe('executeTestCommand', () => {
        it('should return error if qa_sandbox does not exist', async () => {
            fs.existsSync.mockReturnValue(false);
            const result = await executeTestCommand('/base', 'npm test');
            expect(result).toContain('ERRO: Diretório qa_sandbox não encontrado');
        });

        it('should return stdout on success', async () => {
            fs.existsSync.mockReturnValue(true);
            
            exec.mockImplementation((cmd, opts, callback) => {
                callback(null, { stdout: 'Test passed', stderr: '' });
            });

            const result = await executeTestCommand('/base', 'npm test');
            expect(result).toContain('EXIT_CODE: 0');
            expect(result).toContain('Test passed');
        });

        it('should return error logs on failure for Self-Healing', async () => {
            fs.existsSync.mockReturnValue(true);
            
            exec.mockImplementation((cmd, opts, callback) => {
                const err = new Error('Command failed');
                err.code = 1;
                err.stdout = 'Test failed';
                err.stderr = 'Error detail';
                callback(err, { stdout: 'Test failed', stderr: 'Error detail' });
            });

            const result = await executeTestCommand('/base', 'npm test');
            expect(result).toContain('EXIT_CODE: 1');
            expect(result).toContain('Test failed');
            expect(result).toContain('Error detail');
        });
    });
});
