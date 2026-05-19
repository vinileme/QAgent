import fs from "fs";
import path from "path";
import os from "os";
import { jest } from "@jest/globals";
import {
    detectProjectTestStack,
    bootstrapSandbox,
    getRecommendedTestCommand,
} from "../lib/sandbox-bootstrap.js";

const TMP = path.join(os.tmpdir(), `jarvinis-sandbox-test-${Date.now()}`);

beforeAll(() => {
    fs.mkdirSync(TMP, { recursive: true });
});

afterAll(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
});

describe("sandbox-bootstrap", () => {
    it("detecta Jest em projeto ESM", () => {
        const proj = path.join(TMP, "jest-esm");
        fs.mkdirSync(proj, { recursive: true });
        fs.writeFileSync(
            path.join(proj, "package.json"),
            JSON.stringify({
                type: "module",
                devDependencies: { jest: "^30.0.0" },
                scripts: { test: "node --experimental-vm-modules node_modules/jest/bin/jest.js" },
            })
        );

        const stack = detectProjectTestStack(proj);
        expect(stack.runner).toBe("jest");
        expect(stack.isEsm).toBe(true);
    });

    it("detecta Vitest", () => {
        const proj = path.join(TMP, "vitest-proj");
        fs.mkdirSync(proj, { recursive: true });
        fs.writeFileSync(
            path.join(proj, "package.json"),
            JSON.stringify({ devDependencies: { vitest: "^3.0.0" } })
        );

        expect(detectProjectTestStack(proj).runner).toBe("vitest");
    });

    it("cria package.json e manifest na qa_sandbox", async () => {
        const proj = path.join(TMP, "bootstrap-proj");
        fs.mkdirSync(proj, { recursive: true });
        fs.writeFileSync(
            path.join(proj, "package.json"),
            JSON.stringify({ name: "alvo", devDependencies: { jest: "^29.0.0" } })
        );

        const result = await bootstrapSandbox(proj);
        const sandbox = path.join(proj, "qa_sandbox");

        expect(fs.existsSync(sandbox)).toBe(true);
        expect(fs.existsSync(path.join(sandbox, "package.json"))).toBe(true);
        expect(fs.existsSync(path.join(sandbox, ".jarvinis-manifest.json"))).toBe(true);
        expect(result.runner).toBe("jest");
        expect(getRecommendedTestCommand(proj)).toBe("npm test");
    });
});
