import fs from "fs";
import path from "path";
import { exec } from "child_process";
import util from "util";
import { getSandboxConfig } from "./config.js";

const execPromise = util.promisify(exec);
const MANIFEST_FILE = ".jarvinis-manifest.json";

/**
 * Detecta stack de testes do repositório alvo.
 */
export function detectProjectTestStack(basePath) {
    const cfg = getSandboxConfig();
    const pkgPath = path.join(basePath, "package.json");
    let pkg = {};

    if (fs.existsSync(pkgPath)) {
        try {
            pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        } catch {
            pkg = {};
        }
    }

    const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const scripts = pkg.scripts || {};
    const isEsm = pkg.type === "module";

    let runner = cfg.defaultRunner;
    if (allDeps["@playwright/test"] || allDeps.playwright) runner = "playwright";
    else if (allDeps.vitest) runner = "vitest";
    else if (allDeps.jest) runner = "jest";
    else if (allDeps.mocha) runner = "mocha";

    let testCommand = "npm test";
    if (runner === "playwright") testCommand = "npx playwright test";
    else if (runner === "vitest") testCommand = "npm test";
    else if (runner === "jest") testCommand = "npm test";

    if (scripts.test && !scripts.test.includes("echo")) {
        testCommand = "npm test";
    }

    return {
        runner,
        isEsm,
        testCommand,
        packageName: pkg.name || path.basename(basePath),
        parentTestScript: scripts.test || null,
    };
}

function sandboxDir(basePath) {
    return path.join(basePath, "qa_sandbox");
}

function manifestPath(basePath) {
    return path.join(sandboxDir(basePath), MANIFEST_FILE);
}

export function readSandboxManifest(basePath) {
    const mp = manifestPath(basePath);
    if (!fs.existsSync(mp)) return null;
    try {
        return JSON.parse(fs.readFileSync(mp, "utf-8"));
    } catch {
        return null;
    }
}

function jestConfigContent(isEsm) {
    if (isEsm) {
        return `export default {
  testEnvironment: "node",
  roots: ["<rootDir>"],
  testMatch: ["**/*.(test|spec).js"],
  modulePaths: ["<rootDir>/node_modules", "<rootDir>/.."],
};
`;
    }
    return `/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>"],
  testMatch: ["**/*.(test|spec).js"],
  modulePaths: ["<rootDir>/node_modules", "<rootDir>/.."],
};
`;
}

function vitestConfigContent() {
    return `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.{test,spec}.js"],
  },
  resolve: {
    alias: {
      "@target": new URL("..", import.meta.url).pathname,
    },
  },
});
`;
}

function playwrightConfigContent() {
    return `import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["**/*.(spec|test).js"],
  use: { headless: true },
});
`;
}

function buildSandboxPackageJson(stack) {
    const pkg = {
        name: "jarvinis-qa-sandbox",
        private: true,
        version: "1.0.0",
        description: "Sandbox gerada pelo JARVINIS QA Agent",
        scripts: {},
        devDependencies: {},
    };

    switch (stack.runner) {
        case "vitest":
            pkg.type = "module";
            pkg.scripts.test = "vitest run";
            pkg.devDependencies.vitest = "^3.0.0";
            break;
        case "playwright":
            pkg.type = "module";
            pkg.scripts.test = "playwright test";
            pkg.devDependencies = {
                "@playwright/test": "^1.49.0",
            };
            break;
        case "mocha":
            pkg.scripts.test = "mocha '**/*.test.js' --recursive";
            pkg.devDependencies.mocha = "^10.8.0";
            break;
        case "jest":
        default:
            if (stack.isEsm) {
                pkg.type = "module";
                pkg.scripts.test =
                    "node --experimental-vm-modules node_modules/jest/bin/jest.js";
            } else {
                pkg.scripts.test = "jest";
            }
            pkg.devDependencies.jest = "^30.4.2";
            break;
    }

    return pkg;
}

function writeSandboxReadme(sandboxPath, stack) {
    const readme = `# qa_sandbox (JARVINIS)

Sandbox isolada para testes gerados pelo agente QA.

- **Runner detectado:** ${stack.runner}
- **Comando recomendado:** \`${stack.testCommand}\`
- **Projeto alvo:** ${stack.packageName}

## Estrutura

- Coloque testes em \`*.test.js\` ou \`tests/\`
- Importe código do projeto pai com caminhos relativos, ex.: \`import { fn } from '../src/modulo.js'\`
- O Jest/Vitest está configurado com \`modulePaths\` apontando para a raiz do repositório alvo.

## Comandos

\`\`\`bash
cd qa_sandbox
${stack.testCommand}
\`\`\`
`;
    fs.writeFileSync(path.join(sandboxPath, "README.md"), readme);
}

/**
 * Cria/atualiza estrutura da sandbox (package.json, configs, manifest).
 */
export async function bootstrapSandbox(basePath, { force = false } = {}) {
    const cfg = getSandboxConfig();
    if (!cfg.autoBootstrap) {
        return { skipped: true, reason: "QA_SANDBOX_AUTO_BOOTSTRAP=false" };
    }

    const dir = sandboxDir(basePath);
    const stack = detectProjectTestStack(basePath);
    const existing = readSandboxManifest(basePath);

    if (existing && !force && existing.runner === stack.runner) {
        return {
            ...existing,
            reused: true,
            message: `Sandbox já preparada (runner: ${stack.runner}). Comando: ${existing.testCommand}`,
        };
    }

    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const testsDir = path.join(dir, "tests");
    if (!fs.existsSync(testsDir)) fs.mkdirSync(testsDir, { recursive: true });

    const pkg = buildSandboxPackageJson(stack);
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));

    if (stack.runner === "jest") {
        const cfgFile = stack.isEsm ? "jest.config.js" : "jest.config.cjs";
        fs.writeFileSync(path.join(dir, cfgFile), jestConfigContent(stack.isEsm));
    } else if (stack.runner === "vitest") {
        fs.writeFileSync(path.join(dir, "vitest.config.js"), vitestConfigContent());
    } else if (stack.runner === "playwright") {
        fs.writeFileSync(path.join(dir, "playwright.config.js"), playwrightConfigContent());
    }

    writeSandboxReadme(dir, stack);

    const manifest = {
        version: 1,
        createdAt: new Date().toISOString(),
        basePath: path.resolve(basePath),
        runner: stack.runner,
        isEsm: stack.isEsm,
        testCommand: stack.testCommand,
        packageName: stack.packageName,
        depsInstalled: false,
    };

    fs.writeFileSync(manifestPath(basePath), JSON.stringify(manifest, null, 2));

    return {
        ...manifest,
        reused: false,
        message: `Sandbox preparada com ${stack.runner}. Comando recomendado: ${stack.testCommand}`,
    };
}

/**
 * npm install dentro da sandbox (pode demorar).
 */
export async function installSandboxDependencies(basePath) {
    const cfg = getSandboxConfig();
    if (!cfg.autoInstall) {
        return { skipped: true, reason: "QA_SANDBOX_AUTO_INSTALL=false" };
    }

    const dir = sandboxDir(basePath);
    const nodeModules = path.join(dir, "node_modules");

    if (fs.existsSync(nodeModules)) {
        return { skipped: true, reason: "node_modules já existe" };
    }

    if (!fs.existsSync(path.join(dir, "package.json"))) {
        await bootstrapSandbox(basePath);
    }

    try {
        await execPromise("npm install --no-audit --no-fund", {
            cwd: dir,
            timeout: cfg.installTimeout,
            env: { ...process.env, CI: "true" },
        });

        const manifest = readSandboxManifest(basePath) || {};
        manifest.depsInstalled = true;
        manifest.installedAt = new Date().toISOString();
        fs.writeFileSync(manifestPath(basePath), JSON.stringify(manifest, null, 2));

        if (cfg.playwrightBrowsers && manifest.runner === "playwright") {
            await execPromise("npx playwright install chromium", {
                cwd: dir,
                timeout: cfg.installTimeout,
            });
        }

        return { success: true, message: "Dependências instaladas na qa_sandbox." };
    } catch (error) {
        return {
            success: false,
            message: `Falha no npm install da sandbox: ${error.message}`,
            stderr: error.stderr,
        };
    }
}

/**
 * Bootstrap + install se necessário — chamar antes de EXECUTE_TEST.
 */
export async function ensureSandboxReady(basePath) {
    const bootstrap = await bootstrapSandbox(basePath);
    const install = await installSandboxDependencies(basePath);
    const manifest = readSandboxManifest(basePath);

    return {
        manifest,
        bootstrap,
        install,
        testCommand: manifest?.testCommand || detectProjectTestStack(basePath).testCommand,
    };
}

export function getRecommendedTestCommand(basePath) {
    const manifest = readSandboxManifest(basePath);
    if (manifest?.testCommand) return manifest.testCommand;
    return detectProjectTestStack(basePath).testCommand;
}
