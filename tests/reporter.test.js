import fs from 'fs';
import path from 'path';
import { jest } from '@jest/globals';


// Mock html-pdf-node para não abrir o Chromium durante os testes no ambiente ESM
jest.unstable_mockModule('html-pdf-node', () => ({
    default: {
        generatePdf: jest.fn().mockResolvedValue(Buffer.from('PDF_FAKE_CONTENT'))
    }
}));

const { generatePDFReport } = await import('../reporter.js');

const TEST_DIR = path.join(process.cwd(), 'tests', 'mock_repo_report');

beforeAll(() => {
    if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('Reporter (PDF/HTML)', () => {

    it('deve gerar os arquivos HTML e PDF com sucesso no cenário PASSED', async () => {
        const rawLogs = 'EXIT_CODE: 0\nAll tests passed';
        const result = await generatePDFReport(TEST_DIR, 'Resumo do teste executado', rawLogs, 'npm test');
        
        expect(result).toContain('Relatórios gerados com sucesso');
        
        const reportsDir = path.join(TEST_DIR, 'qa_sandbox', 'reports');
        expect(fs.existsSync(reportsDir)).toBe(true);

        const files = fs.readdirSync(reportsDir);
        expect(files.some(f => f.endsWith('.html'))).toBe(true);
        expect(files.some(f => f.endsWith('.pdf'))).toBe(true);
        
        // Valida se injetou verde para sucesso
        const htmlFile = files.find(f => f.endsWith('.html'));
        const htmlContent = fs.readFileSync(path.join(reportsDir, htmlFile), 'utf-8');
        expect(htmlContent).toContain('PASSED');
        expect(htmlContent).toContain('#10B981'); // Cor de sucesso
    });

    it('deve aplicar status FAILED quando os logs contiverem EXIT_CODE: 1', async () => {
        const rawLogs = 'EXIT_CODE: 1\nErro fatal no teste';
        await generatePDFReport(TEST_DIR, 'Resumo da falha', rawLogs, 'npm test');
        
        const reportsDir = path.join(TEST_DIR, 'qa_sandbox', 'reports');
        const files = fs.readdirSync(reportsDir);
        // Pega o último arquivo HTML gerado
        const htmlFiles = files.filter(f => f.endsWith('.html'));
        const latestHtml = htmlFiles[htmlFiles.length - 1];
        
        const htmlContent = fs.readFileSync(path.join(reportsDir, latestHtml), 'utf-8');
        expect(htmlContent).toContain('FAILED');
        expect(htmlContent).toContain('#EF4444'); // Cor de erro
    });
});
