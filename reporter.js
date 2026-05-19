import fs from 'fs';
import path from 'path';
import html_to_pdf from 'html-pdf-node';

export async function generatePDFReport(basePath, aiSummary, rawLogs, testCommand) {
    const reportsDir = path.join(basePath, 'qa_sandbox', 'reports');
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
    }

    const isSuccess = !rawLogs.includes("EXIT_CODE: 1");
    const statusColor = isSuccess ? '#10B981' : '#EF4444'; // Emerald for Success, Red for Failure
    const statusText = isSuccess ? 'PASSED' : 'FAILED';
    const dateStr = new Date().toLocaleString('pt-BR');

    // Sanitiza logs básicos
    const safeLogs = rawLogs.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>JARVINIS Execution Report</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
            
            :root {
                --bg-main: #0F172A;
                --bg-card: #1E293B;
                --text-main: #F8FAFC;
                --text-muted: #94A3B8;
                --accent: #3B82F6;
                --success: #10B981;
                --danger: #EF4444;
            }

            body {
                font-family: 'Inter', sans-serif;
                background-color: var(--bg-main);
                color: var(--text-main);
                margin: 0;
                padding: 40px;
                line-height: 1.6;
            }

            .container {
                max-width: 900px;
                margin: 0 auto;
                background-color: var(--bg-card);
                border-radius: 12px;
                padding: 40px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                border: 1px solid rgba(255,255,255,0.05);
            }

            .header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid rgba(255,255,255,0.1);
                padding-bottom: 20px;
                margin-bottom: 30px;
            }

            .header h1 {
                margin: 0;
                font-size: 28px;
                font-weight: 700;
                letter-spacing: -0.5px;
            }

            .badge {
                background-color: ${statusColor}20;
                color: ${statusColor};
                padding: 8px 16px;
                border-radius: 9999px;
                font-weight: 600;
                font-size: 14px;
                border: 1px solid ${statusColor}50;
            }

            .meta-info {
                display: flex;
                gap: 20px;
                color: var(--text-muted);
                font-size: 14px;
                margin-bottom: 30px;
            }

            .meta-info div {
                display: flex;
                flex-direction: column;
            }

            .meta-info strong {
                color: var(--text-main);
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 1px;
                margin-bottom: 4px;
            }

            .section-title {
                font-size: 20px;
                color: var(--accent);
                margin-top: 40px;
                margin-bottom: 15px;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .summary-box {
                background-color: rgba(59, 130, 246, 0.05);
                border-left: 4px solid var(--accent);
                padding: 20px;
                border-radius: 0 8px 8px 0;
                font-size: 15px;
            }

            .logs-box {
                background-color: #020617;
                padding: 20px;
                border-radius: 8px;
                font-family: 'Courier New', Courier, monospace;
                font-size: 12px;
                color: #CBD5E1;
                overflow-x: auto;
                white-space: pre-wrap;
                border: 1px solid rgba(255,255,255,0.1);
            }

            .footer {
                text-align: center;
                margin-top: 50px;
                font-size: 12px;
                color: var(--text-muted);
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>JARVINIS QA Report</h1>
                <span class="badge">${statusText}</span>
            </div>

            <div class="meta-info">
                <div>
                    <strong>Date & Time</strong>
                    <span>${dateStr}</span>
                </div>
                <div>
                    <strong>Command Executed</strong>
                    <span><code>${testCommand}</code></span>
                </div>
            </div>

            <h2 class="section-title">📊 Executive Summary (AI Analysis)</h2>
            <div class="summary-box">
                ${aiSummary.replace(/\n/g, '<br>')}
            </div>

            <h2 class="section-title">💻 Technical Logs</h2>
            <div class="logs-box">${safeLogs}</div>

            <div class="footer">
                Generated autonomously by Antigravity QA Coordinator
            </div>
        </div>
    </body>
    </html>
    `;

    // Salvar versão HTML interativa
    const htmlFileName = `report_${Date.now()}.html`;
    const htmlFilePath = path.join(reportsDir, htmlFileName);
    fs.writeFileSync(htmlFilePath, htmlContent);

    // Gerar PDF
    const pdfFileName = `report_${Date.now()}.pdf`;
    const pdfFilePath = path.join(reportsDir, pdfFileName);
    
    const file = { content: htmlContent };
    const options = { format: 'A4', printBackground: true, margin: { top: "20px", bottom: "20px" } };

    try {
        const pdfBuffer = await html_to_pdf.generatePdf(file, options);
        fs.writeFileSync(pdfFilePath, pdfBuffer);
        return `✅ Relatórios gerados com sucesso:\n- HTML: qa_sandbox/reports/${htmlFileName}\n- PDF: qa_sandbox/reports/${pdfFileName}`;
    } catch (err) {
        console.error("Erro ao gerar PDF:", err);
        return `⚠️ O HTML foi salvo em qa_sandbox/reports/${htmlFileName}, mas houve erro ao gerar o PDF.`;
    }
}
