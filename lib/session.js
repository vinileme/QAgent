import fs from "fs";
import path from "path";
import os from "os";
import { PROJECT_ROOT } from "./config.js";

function getSessionRoot() {
    if (process.env.JARVINIS_SESSION_DIR) {
        return process.env.JARVINIS_SESSION_DIR;
    }
    const projectSessions = path.join(PROJECT_ROOT, ".jarvinis", "sessions");
    try {
        fs.mkdirSync(projectSessions, { recursive: true });
        return projectSessions;
    } catch {
        return path.join(os.homedir(), ".jarvinis", "sessions");
    }
}

function sessionPath(kind, sessionId) {
    const safeId = sessionId.replace(/[^a-zA-Z0-9._-]/g, "_");
    return path.join(getSessionRoot(), `${kind}-${safeId}.json`);
}

export function loadSession(kind, sessionId) {
    if (!sessionId) return null;
    const file = sessionPath(kind, sessionId);
    if (!fs.existsSync(file)) return null;
    try {
        return JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch {
        return null;
    }
}

export function saveSession(kind, sessionId, data) {
    if (!sessionId) return;
    fs.mkdirSync(getSessionRoot(), { recursive: true });
    const payload = { ...data, updatedAt: new Date().toISOString() };
    fs.writeFileSync(sessionPath(kind, sessionId), JSON.stringify(payload, null, 2));
}

export function clearSession(kind, sessionId) {
    if (!sessionId) return false;
    const file = sessionPath(kind, sessionId);
    if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        return true;
    }
    return false;
}
