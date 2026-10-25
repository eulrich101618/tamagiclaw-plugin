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
const DEFAULT_WEIGHTS = { urgent: 3, high: 1.5, medium: 1, low: 0.5, minor: 0.25 };
const PRIO_RANK = { urgent: 0, high: 1, medium: 2, low: 3, minor: 4 };
function parseTs(s) {
    if (!s)
        return null;
    const ts = Date.parse(s);
    return Number.isFinite(ts) ? ts / 1000 : null;
}
function score(t, now, w) {
    const ts = parseTs(t.last_run);
    if (ts === null)
        return null;
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
    const nevers = cand.filter((t) => !t.last_run).sort((a, b) => (DEFAULT_WEIGHTS[normPrio(b.priority)] ?? 1) - (DEFAULT_WEIGHTS[normPrio(a.priority)] ?? 1) || a.id.localeCompare(b.id));
    if (nevers.length)
        return nevers[0];
    return cand.map((t) => ({ t, s: score(t, now, DEFAULT_WEIGHTS) ?? 0 }))
        .sort((a, b) => b.s - a.s || a.t.id.localeCompare(b.t.id))[0].t;
}
export function fmtList(t) {
    return `id: ${t.id}; title: ${t.title}; tags: ${(t.tags ?? []).join(" ")}`;
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
    tasks = [...tasks].sort((a, b) => {
        const sa = score(a, now, DEFAULT_WEIGHTS), sb = score(b, now, DEFAULT_WEIGHTS);
        if (sa === null && sb === null)
            return a.id.localeCompare(b.id);
        if (sa === null)
            return -1;
        if (sb === null)
            return 1;
        return sb - sa;
    });
    return tasks.map(fmtList).join("\n") || "—";
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
