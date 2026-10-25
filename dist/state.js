import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
export const KEYS = ["drive", "curiosity", "disorder", "loneliness", "boredom"];
export const CMD_TO_KEY = {
    did: "drive",
    played: "curiosity",
    cleaned: "disorder",
    socialized: "loneliness",
    amused: "boredom",
};
const RATE_48H = 100.0 / 48.0;
export function defaultStateFile() {
    return path.join(os.homedir(), ".openclaw", "workspace", "github", "tamagiclaw", "state.json");
}
export function defaultAgentFile() {
    return path.join(os.homedir(), ".openclaw", "workspace", "github", "tamagiclaw", "agent.json");
}
export function resolveStateFile(cfg) {
    const p = cfg?.stateFile || process.env.TAMAGICLAW_STATE || defaultStateFile();
    return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}
function nowIso() {
    return new Date().toISOString();
}
function clamp(v) {
    return Math.max(0, Math.min(100, Math.round(Number(v) * 10) / 10));
}
export function loadState(stateFile) {
    const fallback = {
        drive: 20, curiosity: 30, disorder: 10, loneliness: 15, boredom: 15,
        last_update: nowIso(), log: [], last: {},
    };
    try {
        if (!fs.existsSync(stateFile))
            return { ...fallback };
        const s = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
        if ("hunger" in s && !("drive" in s))
            s.drive = s.hunger;
        delete s.hunger;
        for (const [k, v] of Object.entries(fallback)) {
            if (!(k in s))
                s[k] = v;
        }
        if (typeof s.last !== "object" || s.last === null)
            s.last = {};
        if (!Array.isArray(s.log))
            s.log = [];
        return s;
    }
    catch {
        return { ...fallback };
    }
}
export function applyLazyTick(s) {
    const now = Date.now();
    const last = s.last_update ? Date.parse(s.last_update) : now;
    const hours = Number.isFinite(last) ? Math.max(0, (now - last) / 3_600_000) : 0;
    if (hours <= 0)
        return { hours: 0, applied: false };
    for (const k of KEYS)
        s[k] = clamp(s[k] + RATE_48H * hours);
    return { hours, applied: true };
}
export function saveState(stateFile, s) {
    s.last_update = nowIso();
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify(s, null, 2) + "\n");
}
export function worstKey(s) {
    let w = KEYS[0];
    for (const k of KEYS)
        if (s[k] > s[w])
            w = k;
    return w;
}
export function mood(s) {
    const worst = Math.max(...KEYS.map((k) => s[k]));
    if (worst >= 85)
        return "critical";
    if (worst >= 65)
        return "restless";
    if (worst >= 40)
        return "awake";
    return "content";
}
export function moodLabel(s) {
    return `${mood(s)} (${worstKey(s)})`;
}
export function doReset(s, cmd, action) {
    const key = CMD_TO_KEY[cmd];
    if (!key)
        throw new Error(`unknown reset: ${cmd}`);
    const a = (action || "").trim();
    if (!a)
        throw new Error(`missing description: tamagi ${cmd} "Handlung"`);
    s[key] = 0;
    s.last[key] = { at: nowIso(), action: a };
    s.log = [...(s.log || []).slice(-49), `${nowIso()} ${cmd} — ${a}`];
    return key;
}
export function loadAndTick(stateFile) {
    const s = loadState(stateFile);
    applyLazyTick(s);
    return s;
}
