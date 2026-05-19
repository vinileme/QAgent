import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

dotenv.config({ path: path.join(projectRoot, ".env") });

export const PROJECT_ROOT = projectRoot;

export function getOllamaHost() {
    return process.env.OLLAMA_HOST || "http://localhost:11434";
}

/** Modelo do chat geral (Frente 1). */
export function getChatModel() {
    return (
        process.env.OLLAMA_MODEL ||
        process.env.OLLAMA_ROUTER_MODEL ||
        "jarvinis"
    );
}

export function getRouterModel() {
    return process.env.OLLAMA_ROUTER_MODEL || process.env.OLLAMA_MODEL || "jarvinis";
}

export function getQaModel() {
    return process.env.OLLAMA_QA_MODEL || process.env.OLLAMA_ROUTER_MODEL || getChatModel();
}

export function getHistoryModel() {
    return process.env.OLLAMA_HISTORY_MODEL || getRouterModel();
}

export function getObsidianVaultPath() {
    return process.env.OBSIDIAN_VAULT_PATH || "";
}

/** Caminho absoluto deste repositório (para pipes Open WebUI). */
export function getJarvinisRoot() {
    return process.env.JARVINIS_ROOT || PROJECT_ROOT;
}

export function getSandboxConfig() {
    return {
        autoBootstrap: process.env.QA_SANDBOX_AUTO_BOOTSTRAP !== "false",
        autoInstall: process.env.QA_SANDBOX_AUTO_INSTALL !== "false",
        installTimeout: parseInt(process.env.QA_SANDBOX_INSTALL_TIMEOUT || "120000", 10),
        defaultRunner: process.env.QA_SANDBOX_DEFAULT_RUNNER || "jest",
        playwrightBrowsers: process.env.QA_SANDBOX_PLAYWRIGHT_INSTALL === "true",
    };
}
