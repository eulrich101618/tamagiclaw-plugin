import { Type } from "typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import {
  KEYS, CMD_TO_KEY, loadAndTick, saveState, resolveStateFile,
  moodLabel, worstKey, mood, doReset, type TamagiState,
} from "./state.js";
import {
  resolveTasksFile, splitTags, hbList, hbShow, hbRun, hbDone, hbAdd, hbEdit,
} from "./tasks.js";

function fmt(s: TamagiState): string {
  const lines = KEYS.map((k) => `${k}: ${s[k]}`);
  return `${lines.join(" | ")} — ${moodLabel(s)}`;
}

const actionSchema = Type.Object({ action: Type.String({ description: "What was done (past tense, required)" }) });

const HELP_MAIN = [
  "Use: /tamagi <command> [args]",
  "",
  "status — Show state (lazy tick). Always call first.",
  "did <text> — Reset drive to 0.",
  "played <text> — Reset curiosity to 0.",
  "cleaned <text> — Reset disorder to 0.",
  "socialized <text> — Reset loneliness to 0.",
  "amused <text> — Reset boredom to 0.",
  "log — Recent actions.",
  "task <sub> — Task list (see /tamagi task help).",
  "help — This help.",
].join("\n");
const HELP_LOG = "Use: /tamagi log — shows the last 15 actions.";
const HELP_TASK = [
  "Use: /tamagi task <sub> [args]",
  "",
  "list [tags...] — List tasks, optionally filtered (AND). e.g. /tamagi task list Neugier Abend",
  "show <id> — Show one task as JSON.",
  "run <id> | <tag1> <tag2> [...] — Pick one task by ID or at least 2 tags and mark it done.",
  "done <id> [note] — Mark a task as done.",
  "add/edit — Via tool only (tamagi_task_add / tamagi_task_edit).",
  "help — This help.",
].join("\n");

export default definePluginEntry({
  id: "tamagiclaw",
  name: "Tamagiclaw",
  description: "Tamagiclaw core (lazy tick, no dashboard)",
  register(api) {
    const cfg = (api.pluginConfig ?? {}) as { stateFile?: string; tasksFile?: string; agent?: string };
    type Ctx = { workspaceDir?: string };
    const statePath = (ctx?: Ctx) => resolveStateFile(cfg, ctx as { workspaceDir?: string });
    const tasksPath = (ctx?: Ctx) => resolveTasksFile(cfg, ctx as { workspaceDir?: string });

    const read = (ctx?: Ctx) => {
      const f = statePath(ctx);
      const s = loadAndTick(f);
      saveState(f, s);
      return s;
    };
    const reset = (cmd: string, action: string, ctx?: Ctx) => {
      const f = statePath(ctx);
      const s = loadAndTick(f);
      doReset(s, cmd, action);
      saveState(f, s);
      return s;
    };

    api.registerTool({
      name: "tamagi_status",
      label: "Tamagi status",
      description: "Show tamagiclaw state (lazy tick applied). Always call first.",
      parameters: Type.Object({}),
      async execute(_toolCallId, _params, ctx) {
        const s = read(ctx as Ctx);
        return {
          content: [{ type: "text", text: fmt(s) }],
          details: { ...s, mood: mood(s), mood_cause: worstKey(s) },
        };
      },
    });

    for (const cmd of Object.keys(CMD_TO_KEY)) {
      api.registerTool({
        name: `tamagi_${cmd}`,
        label: `Tamagi ${cmd}`,
        description: `Reset ${CMD_TO_KEY[cmd]} to 0 (description required).`,
        parameters: actionSchema,
        async execute(_toolCallId, params, ctx) {
          try {
            const s = reset(cmd, (params as { action: string }).action, ctx as Ctx);
            return {
              content: [{ type: "text", text: `ok — ${fmt(s)}` }],
              details: { ...s, mood: mood(s), mood_cause: worstKey(s) },
            };
          } catch (e) {
            const text = String((e as Error)?.message ?? e);
            return { content: [{ type: "text", text }], details: { error: text } };
          }
        },
      });
    }

    api.registerTool({
      name: "tamagi_log",
      label: "Tamagi log",
      description: "Recent tamagiclaw actions.",
      parameters: Type.Object({ limit: Type.Optional(Type.Number({ description: "Max lines (default 15)" })) }),
      async execute(_toolCallId, params, ctx) {
        const s = read(ctx as Ctx);
        const n = Math.max(1, Math.min(50, Number((params as { limit?: number }).limit ?? 15)));
        const lines = (s.log || []).slice(-n);
        return {
          content: [{ type: "text", text: lines.join("\n") || "—" }],
          details: { lines },
        };
      },
    });

    const hb = (ctx: Ctx | undefined, fn: (f: string) => string) => {
      try { return { text: fn(tasksPath(ctx)) }; }
      catch (e) { return { text: String((e as Error)?.message ?? e) }; }
    };
    const hbTools: { name: string; label: string; desc: string; params: Record<string, unknown>; run: (f: string, p: Record<string, unknown>) => string }[] = [
      { name: "tamagi_task_list", label: "Task list", desc: "List tasks, optionally filtered by tags.", params: { tags: Type.Optional(Type.String()) }, run: (f, p) => hbList(f, splitTags(String(p.tags ?? ""))) },
      { name: "tamagi_task_show", label: "Task show", desc: "Show one task as JSON.", params: { id: Type.String() }, run: (f, p) => hbShow(f, String(p.id)) },
      { name: "tamagi_task_run", label: "Task run", desc: "Pick one task by ID or at least 2 tags and mark it done.", params: { id: Type.Optional(Type.String()), tags: Type.Optional(Type.String()) }, run: (f, p) => hbRun(f, { id: p.id ? String(p.id) : undefined, tags: splitTags(String(p.tags ?? "")) }) },
      { name: "tamagi_task_done", label: "Task done", desc: "Mark a task as done.", params: { id: Type.String(), note: Type.Optional(Type.String()) }, run: (f, p) => hbDone(f, String(p.id), p.note ? String(p.note) : undefined) },
      { name: "tamagi_task_add", label: "Task add", desc: "Create a task with at least 2 existing tags.", params: { title: Type.String(), tags: Type.String(), detail: Type.Optional(Type.String()), priority: Type.Optional(Type.String()), id: Type.Optional(Type.String()) }, run: (f, p) => hbAdd(f, { title: String(p.title), detail: p.detail ? String(p.detail) : "", tags: splitTags(String(p.tags)), priority: p.priority ? String(p.priority) : undefined, id: p.id ? String(p.id) : undefined }) },
      { name: "tamagi_task_edit", label: "Task edit", desc: "Edit title, detail, tags, priority or active flag of a task.", params: { id: Type.String(), title: Type.Optional(Type.String()), detail: Type.Optional(Type.String()), tags: Type.Optional(Type.String()), priority: Type.Optional(Type.String()), active: Type.Optional(Type.Boolean()) }, run: (f, p) => hbEdit(f, String(p.id), { title: p.title ? String(p.title) : undefined, detail: p.detail ? String(p.detail) : undefined, tags: p.tags ? splitTags(String(p.tags)) : undefined, priority: p.priority ? String(p.priority) : undefined, active: p.active as boolean | undefined }) },
    ];
    for (const t of hbTools) {
      api.registerTool({
        name: t.name, label: t.label, description: t.desc,
        parameters: Type.Object(t.params as never),
        async execute(_toolCallId, params, ctx) {
          const r = hb(ctx as Ctx, (f) => t.run(f, params as Record<string, unknown>));
          return { content: [{ type: "text", text: r.text }], details: { text: r.text } };
        },
      });
    }

    api.registerCommand({
      name: "tamagi",
      description: "Tamagiclaw: status | did | ... | log | task ...",
      acceptsArgs: true,
      async handler(ctx) {
        const raw = (ctx.args ?? "").trim();
        const [sub, ...rest] = raw.split(/\s+/);
        const action = rest.join(" ");
        const c = ctx as unknown as Ctx;
        if (!sub || sub === "status") return { text: fmt(read(c)) };
        if (sub === "help") return { text: HELP_MAIN };
        if (sub === "log") {
          if (rest[0] === "help" || rest[0] === "--help" || rest[0] === "-h") return { text: HELP_LOG };
          return { text: (read(c).log || []).slice(-15).join("\n") || "—" };
        };
        if (sub in CMD_TO_KEY) {
          if (!action || action === "help" || action === "--help" || action === "-h") return { text: `Use: /tamagi ${sub} <what was done> — resets ${(CMD_TO_KEY as Record<string, string>)[sub]} to 0.` };
          if (!action) return { text: `Missing description. e.g. /tamagi ${sub} <what was done>` };
          try { return { text: `ok — ${fmt(reset(sub, action, c))}` }; }
          catch (e) { return { text: String((e as Error)?.message ?? e) }; }
        }
        if (sub === "task") {
          const [hs, ...hrest] = rest;
          const harg = hrest.join(" ");
          const tags = splitTags(harg);
          if (!hs || hs === "help" || hs === "--help" || hs === "-h") return { text: HELP_TASK };
          if (hs === "list" && (harg === "help" || harg === "--help" || harg === "-h")) return { text: "Use: /tamagi task list [tag1 tag2 ...] — AND filter, at least 0 tags." };
          if (hs === "show" && (!hrest[0] || hrest[0] === "help")) return { text: "Use: /tamagi task show <id>" };
          if (hs === "run" && (!hrest[0] || hrest[0] === "help")) return { text: "Use: /tamagi task run <id> | <tag1> <tag2> [...] (at least 2 existing tags)" };
          if (hs === "done" && (!hrest[0] || hrest[0] === "help")) return { text: "Use: /tamagi task done <id> [note]" };
          if (!hs || hs === "list") return hb(c, (f) => hbList(f, tags));
          if (hs === "show") return hb(c, (f) => hbShow(f, hrest[0] ?? ""));
          if (hs === "run") {
            if (hrest.length === 1 && !harg.includes(" ") && !harg.includes(",")) return hb(c, (f) => hbRun(f, { id: hrest[0], tags: [] }));
            return hb(c, (f) => hbRun(f, { tags }));
          }
          if (hs === "done") return hb(c, (f) => hbDone(f, hrest[0] ?? "", hrest.slice(1).join(" ") || undefined));
          if (hs === "add") return { text: "Use: /tamagi task list|run|show|done (add/edit via tool)" };
          return { text: "Use: /tamagi task list|run|show|done" };
        }
        return { text: "Use: /tamagi status | did | played | cleaned | socialized | amused | log | task ..." };
      },
    });

    api.registerCli(({ program }) => {
      const c = program.command("tamagi").description("Tamagiclaw core + tasks. Use 'tamagi help' for details.");
      c.command("help").description("Show help").action(() => console.log([HELP_MAIN, "", HELP_TASK].join("\n")));
      const h = c.command("task").description("Tasks. Use 'tamagi task help' for details.");
      h.command("help").description("Show task help").action(() => console.log(HELP_TASK));
      h.command("list [tags...]").description("List tasks, optionally filtered by tags (AND)").action((tags: string[]) => console.log(hbList(tasksPath(undefined), splitTags(tags ?? []))));
      h.command("show <id>").description("Show one task as JSON").action((id: string) => console.log(hbShow(tasksPath(undefined), id)));
      h.command("run [sel...]").description("Pick one task by ID or at least 2 tags and mark done").action((sel: string[]) => {
        const s = (sel ?? []).join(" ");
        if ((sel ?? []).length === 1 && !s.includes(" ")) console.log(hbRun(tasksPath(undefined), { id: sel[0], tags: [] }));
        else console.log(hbRun(tasksPath(undefined), { tags: splitTags(sel ?? []) }));
      });
      h.command("done <id> [note...]").description("Mark a task as done").action((id: string, note: string[]) => console.log(hbDone(tasksPath(undefined), id, (note ?? []).join(" ") || undefined)));
      c.command("status").description("Show state").action(() => {
        console.log(fmt(read()));
      });
      for (const cmd of Object.keys(CMD_TO_KEY)) {
        c.command(cmd).description(`Reset ${CMD_TO_KEY[cmd]} to 0`)
          .argument("<action...>", "What was done")
          .action((parts: string[]) => {
            try {
              console.log(`ok — ${fmt(reset(cmd, parts.join(" ")))}`);
            } catch (e) {
              console.error(String((e as Error)?.message ?? e));
              process.exit(1);
            }
          });
      }
      c.command("log").description("Recent actions").action(() => {
        console.log((read().log || []).slice(-15).join("\n") || "—");
      });
    });
  },
});
