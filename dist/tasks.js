import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { agentWorkspace } from "./state.js";
export function defaultTasksFile(ctx, agent = "main") {
    const ws = ctx?.workspaceDir || agentWorkspace(agent);
    return path.join(ws, "tamagi", "tasks.json");
}
export function resolveTasksFile(cfg, ctx) {
    if (process.env.TAMAGICLAW_TASKS)
        return process.env.TAMAGICLAW_TASKS;
    if (cfg?.tasksFile)
        return cfg.tasksFile.startsWith("~") ? path.join(os.homedir(), cfg.tasksFile.slice(1)) : cfg.tasksFile;
    const agent = cfg?.agent || process.env.TAMAGICLAW_AGENT || "main";
    return defaultTasksFile(ctx, agent);
}
export function loadDB(f) {
    try {
        return JSON.parse(fs.readFileSync(f, "utf-8"));
    }
    catch {
        // auto-create workspace dir + file on first use
        fs.mkdirSync(path.dirname(f), { recursive: true });
        const empty = { tasks: [] };
        try {
            fs.writeFileSync(f, JSON.stringify(empty, null, 2) + "\n", { flag: "wx" });
        }
        catch { /* exists */ }
        try {
            return JSON.parse(fs.readFileSync(f, "utf-8"));
        }
        catch {
            return empty;
        }
    }
}
export function saveDB(f, d) {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(d, null, 2) + "\n");
}
export function normTag(s) {
    s = String(s ?? "").trim().replace(/^#+/, "").trim();
    return s ? s.slice(0, 1).toUpperCase() + s.slice(1) : s;
}
export function splitTags(...parts) {
    const out = [];
    for (const p of parts) {
        if (!p)
            continue;
        if (Array.isArray(p)) {
            out.push(...splitTags(...p));
            continue;
        }
        for (const tok of String(p).replace(/,/g, " ").split(/\s+/)) {
            const t = normTag(tok);
            if (t)
                out.push(t);
        }
    }
    return [...new Set(out)];
}
export const allTags = (tasks) => [...new Set(tasks.flatMap((t) => t.tags ?? []))].sort();
const PRIO_MAP = {
    dringend: "urgent", hoch: "high", mittel: "medium", niedrig: "low", gering: "minor",
    urgent: "urgent", high: "high", medium: "medium", low: "low", minor: "minor",
};
export const normPrio = (s, dflt = "medium") => PRIO_MAP[String(s ?? "").trim().toLowerCase()] ?? dflt;
export const PRIO_WEIGHTS = { urgent: 3, high: 1.5, medium: 1, low: 0.5, minor: 0.25 };
const PRIO_RANK = { urgent: 0, high: 1, medium: 2, low: 3, minor: 4 };
function parseTs(s) {
    if (!s)
        return null;
    const ts = Date.parse(s);
    return Number.isFinite(ts) ? ts / 1000 : null;
}
export function taskScore(t, now = Date.now() / 1000) {
    const ts = parseTs(t.last_run) ?? parseTs(t.created) ?? 0;
    return ((now - ts) / 60) * (PRIO_WEIGHTS[normPrio(t.priority)] ?? 1);
}
function score(t, now, w) {
    const ts = parseTs(t.last_run) ?? parseTs(t.created) ?? 0;
    return ((now - ts) / 60) * (w[normPrio(t.priority)] ?? 1);
}
export function pick(tasks, tags, opts) {
    let cand = tasks.filter((t) => t.active !== false && tags.every((x) => (t.tags ?? []).includes(x)));
    if (opts?.minPriority && opts.minPriority in PRIO_RANK) {
        const thr = PRIO_RANK[opts.minPriority];
        cand = cand.filter((t) => (PRIO_RANK[normPrio(t.priority)] ?? 2) <= thr);
    }
    if (!cand.length)
        throw new Error(`no task found (tags=${tags.join(" ")})`);
    const now = Date.now() / 1000;
    const nevers = cand.filter((t) => !t.last_run).sort((a, b) => (PRIO_WEIGHTS[normPrio(b.priority)] ?? 1) - (PRIO_WEIGHTS[normPrio(a.priority)] ?? 1) || a.id.localeCompare(b.id));
    if (nevers.length)
        return nevers[0];
    return cand.map((t) => ({ t, s: score(t, now, PRIO_WEIGHTS) ?? 0 }))
        .sort((a, b) => b.s - a.s || a.t.id.localeCompare(b.t.id))[0].t;
}
export function fmtList(t, s, rank, isNext) {
    const sc = s === undefined ? taskScore(t) : s;
    const tagStr = (t.tags ?? []).map((x) => `\`${x}\``).join(";") || "-";
    const prefix = rank !== undefined ? `${rank}. ${isNext ? "▶ " : ""}` : isNext ? "▶ " : "- ";
    const pts = sc === null ? "" : ` · urgency-points: ${Math.round(sc)}`;
    return `${prefix}**${t.title}** — id: \`${t.id}\`${pts} · tags: ${tagStr}`;
}
export function fmtTask(t) {
    return `${t.title} (${t.id})\nDescription: ${t.detail || "-"}\nTags: ${(t.tags ?? []).join(" ")}`;
}
function nowLocal() {
    const d = new Date();
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? "+" : "-";
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`;
}
export function hbList(f, tags) {
    const d = loadDB(f);
    let tasks = d.tasks.filter((t) => t.active !== false);
    if (tags.length)
        tasks = tasks.filter((t) => tags.every((x) => (t.tags ?? []).includes(x)));
    const now = Date.now() / 1000;
    const scored = tasks.map((t) => ({ t, s: score(t, now, PRIO_WEIGHTS) }));
    scored.sort((a, b) => {
        if (a.s === null && b.s === null)
            return (PRIO_WEIGHTS[normPrio(a.t.priority)] ?? 1) - (PRIO_WEIGHTS[normPrio(b.t.priority)] ?? 1) || a.t.id.localeCompare(b.t.id);
        if (a.s === null)
            return 1;
        if (b.s === null)
            return -1;
        return a.s - b.s;
    });
    if (!scored.length)
        return "- No tasks.";
    const n = scored.length;
    const lines = scored.map(({ t, s }, i) => fmtList(t, s, n - i, i === n - 1));
    return `# **Descending to the highest priority.**\n${lines.join("\n")}`;
}
export function hbShow(f, id) {
    const t = loadDB(f).tasks.find((x) => x.id === id);
    if (!t)
        throw new Error(`not found: ${id}`);
    return JSON.stringify(t, null, 2);
}
export function hbRun(f, sel) {
    const d = loadDB(f);
    let t;
    if (sel.id) {
        t = d.tasks.find((x) => x.id === sel.id);
        if (!t)
            throw new Error(`not found: ${sel.id}`);
    }
    else if (!sel.tags.length) {
        t = pick(d.tasks, []);
    }
    else {
        if (sel.tags.length < 2)
            throw new Error("at least 2 tags required");
        const known = new Set(allTags(d.tasks));
        const unk = sel.tags.filter((x) => !known.has(x));
        if (unk.length)
            throw new Error(`unknown tags: ${unk.join(" ")} | available: ${[...known].join(" ")}`);
        t = pick(d.tasks, sel.tags);
    }
    if (t.active === false)
        throw new Error(`inactive: ${t.id}`);
    t.last_run = nowLocal();
    saveDB(f, d);
    return fmtTask(t);
}
export function hbDone(f, id, note) {
    const d = loadDB(f);
    const t = d.tasks.find((x) => x.id === id);
    if (!t)
        throw new Error(`not found: ${id}`);
    t.last_run = nowLocal();
    if (note)
        t.last_note = note;
    saveDB(f, d);
    return `ok ${id} ${t.last_run}`;
}
function slugify(s) {
    const rep = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };
    s = s.toLowerCase();
    for (const [k, v] of Object.entries(rep))
        s = s.split(k).join(v);
    return s.replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
export function hbAdd(f, o) {
    const d = loadDB(f);
    if (o.tags.length < 2)
        throw new Error("at least 2 tags required");
    const known = new Set(allTags(d.tasks));
    const unk = o.tags.filter((x) => !known.has(x));
    if (unk.length)
        throw new Error(`unknown tags: ${unk.join(" ")}`);
    let nid = (o.id ?? slugify(o.title).slice(0, 40)) || "task";
    if (d.tasks.some((t) => t.id === nid))
        throw new Error(`ID taken: ${nid}`);
    d.tasks.push({ id: nid, title: o.title, detail: o.detail ?? "", tags: o.tags, priority: normPrio(o.priority), last_run: null, created: nowLocal().slice(0, 10), active: true });
    saveDB(f, d);
    return nid;
}
export function hbEdit(f, id, o) {
    const d = loadDB(f);
    const t = d.tasks.find((x) => x.id === id);
    if (!t)
        throw new Error(`not found: ${id}`);
    if (o.title !== undefined)
        t.title = o.title;
    if (o.detail !== undefined)
        t.detail = o.detail;
    if (o.tags !== undefined)
        t.tags = o.tags;
    if (o.priority !== undefined)
        t.priority = normPrio(o.priority);
    if (o.active !== undefined)
        t.active = o.active;
    saveDB(f, d);
    return `ok ${id}`;
}
export function hbSlots(f) {
    const d = loadDB(f);
    return (d.time_slots ?? []).map((s) => `${s.tag}: ${s.start}-${s.end}h`).join("\n") || "—";
}
