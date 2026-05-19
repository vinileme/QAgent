import chalk from "chalk";
import { getOllamaHost } from "./config.js";

const THINK_OPEN = "\u003cthink\u003e";
const THINK_CLOSE = "\u003c/think\u003e";
const REDACTED_OPEN = "<think>";
const REDACTED_CLOSE = "</think>";

/** Remove blocos de raciocínio (DeepSeek-R1 e variantes). */
export function stripThinking(content) {
    let result = content;
    result = result.replace(
        new RegExp(THINK_OPEN + "[\\s\\S]*?" + THINK_CLOSE, "gi"),
        ""
    );
    result = result.replace(
        new RegExp(REDACTED_OPEN + "[\\s\\S]*?" + REDACTED_CLOSE, "gi"),
        ""
    );
    return result.trim();
}

function isThinkingInProgress(text) {
    return (
        (text.includes(THINK_OPEN) && !text.includes(THINK_CLOSE)) ||
        (text.includes(REDACTED_OPEN) && !text.includes(REDACTED_CLOSE))
    );
}

/**
 * Chat com histórico (streaming opcional).
 * @returns {{ message?: { content: string }, error?: string }}
 */
export async function callOllamaChat({
    messages,
    model,
    systemPrompt,
    stream = true,
    silent = false,
}) {
    const hasSystem = messages.length > 0 && messages[0].role === "system";
    const finalMessages = hasSystem
        ? messages
        : [{ role: "system", content: systemPrompt }, ...messages];

    const payload = { model, messages: finalMessages, stream };

    try {
        const response = await fetch(`${getOllamaHost()}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`HTTP Error ${response.status}: ${errText}`);
        }

        if (!stream) {
            const data = await response.json();
            const content = stripThinking(data.message?.content || "");
            return { message: { content } };
        }

        if (!silent) process.stdout.write("\r\x1b[K🤖 JARVINIS:\n");

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullContent = "";
        let isThinking = false;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n").filter((l) => l.trim() !== "");

            for (const line of lines) {
                try {
                    const json = JSON.parse(line);
                    if (!json.message?.content) continue;

                    const token = json.message.content;
                    fullContent += token;

                    const inThink = isThinkingInProgress(fullContent);

                    if (inThink && !isThinking) {
                        isThinking = true;
                        if (!silent) {
                            process.stdout.write(
                                chalk.dim.italic("\n🧠 Pensando na estratégia...\n")
                            );
                        }
                    } else if (!inThink && isThinking) {
                        isThinking = false;
                        if (!silent) process.stdout.write("\n\n");
                    }

                    if (!silent) {
                        process.stdout.write(isThinking ? chalk.dim.italic(token) : token);
                    }
                } catch {
                    // chunk JSON parcial
                }
            }
        }

        if (!silent) console.log("\x1b[0m\n");

        return { message: { content: stripThinking(fullContent) } };
    } catch (error) {
        return { error: error.message };
    }
}

/**
 * Geração simples (Frente 1 — compatível com integrações legadas).
 */
export async function callOllamaGenerate({ prompt, model, systemPrompt, stream = false }) {
    try {
        const response = await fetch(`${getOllamaHost()}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                system: systemPrompt,
                prompt,
                stream,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`HTTP Error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        return { response: stripThinking(data.response || "") };
    } catch (error) {
        return { error: error.message };
    }
}
