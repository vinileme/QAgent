#!/usr/bin/env node
/**
 * Valida .env e conectividade com Ollama.
 * Uso: npm run check:env
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
    getOllamaHost,
    getChatModel,
    getRouterModel,
    getQaModel,
    getObsidianVaultPath,
    getJarvinisRoot,
    getSandboxConfig,
} from "../lib/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");

const checks = [];

function ok(msg) {
    checks.push({ ok: true, msg });
}
function warn(msg) {
    checks.push({ ok: true, warn: true, msg });
}
function fail(msg) {
    checks.push({ ok: false, msg });
}

console.log("\n🔍 JARVINIS — Verificação de ambiente\n");

if (!fs.existsSync(envPath)) {
    fail("Arquivo .env não encontrado. Execute: cp .env.example .env");
} else {
    ok(".env encontrado");
}

ok(`OLLAMA_HOST = ${getOllamaHost()}`);
ok(`Chat (Frente 1): ${getChatModel()}`);
ok(`QA Router: ${getRouterModel()}`);
ok(`QA Coder: ${getQaModel()}`);

const vault = getObsidianVaultPath();
if (!vault) warn("OBSIDIAN_VAULT_PATH vazio — RAG de notas desativado");
else if (!fs.existsSync(vault)) warn(`Vault não encontrado: ${vault}`);
else ok(`Obsidian vault: ${vault}`);

const jarvinisRoot = getJarvinisRoot();
if (fs.existsSync(jarvinisRoot)) ok(`JARVINIS_ROOT: ${jarvinisRoot}`);
else fail(`JARVINIS_ROOT inválido: ${jarvinisRoot}`);

const sb = getSandboxConfig();
ok(
    `Sandbox: bootstrap=${sb.autoBootstrap} install=${sb.autoInstall} runner=${sb.defaultRunner}`
);

try {
    const res = await fetch(`${getOllamaHost()}/api/tags`);
    if (res.ok) {
        const data = await res.json();
        const names = (data.models || []).map((m) => m.name);
        ok(`Ollama online — ${names.length} modelo(s) instalado(s)`);

        for (const required of [getChatModel(), getRouterModel(), getQaModel()]) {
            const base = required.split(":")[0];
            const found = names.some((n) => n === required || n.startsWith(base));
            if (found) ok(`Modelo disponível: ${required}`);
            else warn(`Modelo não encontrado no Ollama: ${required}`);
        }
    } else {
        fail(`Ollama respondeu HTTP ${res.status}`);
    }
} catch (e) {
    fail(`Ollama inacessível em ${getOllamaHost()} — ${e.message}`);
}

console.log("");
for (const c of checks) {
    const icon = c.ok ? (c.warn ? "⚠️ " : "✅ ") : "❌ ";
    console.log(icon + c.msg);
}

const hasFail = checks.some((c) => !c.ok);
console.log(hasFail ? "\nCorrija os itens ❌ antes de usar.\n" : "\nAmbiente OK.\n");
process.exit(hasFail ? 1 : 0);
