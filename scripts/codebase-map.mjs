#!/usr/bin/env node
/**
 * Codebase map + knowledge graph (graphify-style, deterministic, no dependencies, no API keys).
 *
 * - Tree:   every file tracked by git (no .env, virtual environments, node_modules, build output,
 *           personal git-ignored files), with sizes and a breakdown by file type.
 * - Graph:  files as nodes; edges from Python imports, JS/TS imports (tsconfig path aliases included)
 *           and relative Markdown links. Colour by folder, owner (.github/CODEOWNERS) or community
 *           (label propagation on the import graph).
 * - Report: most-depended-on files, isolated files, dependencies between owners, communities.
 *
 * Usage:  node scripts/codebase-map.mjs [--root DIR] [--out FILE.html] [--json FILE.json] [--title NAME]
 *   --root   repository to scan (default: git top level of the current directory)
 *   --out    HTML output (default: <root>/codebase-map.html)
 *   --json   also write the graph as JSON (default: next to --out, "<name>.json")
 *   --title  page title (default: root folder name)
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, posix, relative, resolve } from "node:path";

// ---------------------------------------------------------------- arguments

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

function gitIn(dir, ...gitArgs) {
  return execFileSync("git", ["-C", dir, ...gitArgs], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

let ROOT = opt("root", "");
if (!ROOT) {
  try {
    ROOT = gitIn(process.cwd(), "rev-parse", "--show-toplevel").trim();
  } catch {
    ROOT = process.cwd();
  }
}
ROOT = resolve(ROOT);
const OUT = resolve(opt("out", join(ROOT, "codebase-map.html")));
const JSON_OUT = resolve(opt("json", join(dirname(OUT), basename(OUT, extname(OUT)) + ".json")));
const TITLE = opt("title", basename(ROOT));

// ---------------------------------------------------------------- files

const SKIP_DIRS = new Set([".git", "node_modules", ".venv", "venv", "__pycache__", ".next", "dist", "build", ".turbo", ".cache"]);

function walk(dir, prefix = "") {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".env")) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(join(dir, entry.name), rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

let files;
let commit = "";
let repoUrl = "";
try {
  files = gitIn(ROOT, "ls-files", "-z").split("\0").filter(Boolean);
  try {
    commit = gitIn(ROOT, "rev-parse", "--short", "HEAD").trim();
  } catch {
    /* no commits yet */
  }
  try {
    const remote = gitIn(ROOT, "remote", "get-url", "origin").trim();
    const m = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
    if (m) repoUrl = `https://github.com/${m[1]}`;
  } catch {
    /* no remote */
  }
} catch {
  files = walk(ROOT); // not a git repository
}

const sizes = new Map();
files = files.filter((f) => {
  try {
    sizes.set(f, statSync(join(ROOT, f)).size);
    return true;
  } catch {
    return false; // deleted in the working tree
  }
});
const fileSet = new Set(files);
const read = (f) => {
  try {
    return readFileSync(join(ROOT, f), "utf8");
  } catch {
    return "";
  }
};

// ---------------------------------------------------------------- tree + stats

const tree = { name: TITLE, size: 0, children: new Map() };
const byExt = new Map();
let dirCount = 0;
const extOf = (name) => extname(name).toLowerCase() || name.toLowerCase();

for (const rel of files) {
  const size = sizes.get(rel);
  const parts = rel.split("/");
  let node = tree;
  node.size += size;
  for (const d of parts.slice(0, -1)) {
    if (!node.children.has(d)) {
      node.children.set(d, { name: d, size: 0, children: new Map() });
      dirCount += 1;
    }
    node = node.children.get(d);
    node.size += size;
  }
  const name = parts.at(-1);
  const ext = extOf(name);
  node.children.set(name, { name, size, ext });
  const agg = byExt.get(ext) ?? { count: 0, size: 0 };
  byExt.set(ext, { count: agg.count + 1, size: agg.size + size });
}
const plainTree = (n) => (n.children ? { name: n.name, size: n.size, children: [...n.children.values()].map(plainTree) } : n);

// ---------------------------------------------------------------- graph: nodes

const CODE_EXT = new Set([".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const DOC_EXT = new Set([".md", ".mdx"]);
const kindOf = (f) => (CODE_EXT.has(extname(f).toLowerCase()) ? "code" : DOC_EXT.has(extname(f).toLowerCase()) ? "doc" : "file");
const edges = new Map(); // "a\0b\0type" -> edge
const addEdge = (source, target, type) => {
  if (!target || source === target || !fileSet.has(target)) return;
  edges.set(`${source}\0${target}\0${type}`, { source, target, type });
};

// ---------------------------------------------------------------- graph: Python imports

const pyRoots = [
  "",
  ...files
    .filter((f) => /(^|\/)(pyproject\.toml|setup\.py|setup\.cfg)$/.test(f))
    .map((f) => posix.dirname(f))
    .filter((d) => d !== "."),
];
for (const d of [...pyRoots]) if (d !== "" && fileSet.has(`${d}/src`)) pyRoots.push(`${d}/src`);
const rootOf = (f) => pyRoots.filter((r) => r === "" || f.startsWith(`${r}/`)).sort((a, b) => b.length - a.length)[0] ?? "";
const pyModule = (root, dotted) => {
  const base = (root ? `${root}/` : "") + dotted.replaceAll(".", "/");
  if (fileSet.has(`${base}.py`)) return `${base}.py`;
  if (fileSet.has(`${base}/__init__.py`)) return `${base}/__init__.py`;
  return null;
};

for (const f of files.filter((x) => x.endsWith(".py"))) {
  const root = rootOf(f);
  const src = read(f).replace(/("""|''')[\s\S]*?\1/g, "");
  const resolveDotted = (dotted) => {
    if (!dotted.startsWith(".")) return { root, mod: dotted };
    const dots = dotted.match(/^\.+/)[0].length;
    let pkg = posix.dirname(f);
    for (let i = 1; i < dots; i++) pkg = posix.dirname(pkg);
    const rest = dotted.slice(dots);
    const relPkg = root && pkg.startsWith(`${root}/`) ? pkg.slice(root.length + 1) : pkg;
    return { root, mod: [relPkg.replaceAll("/", "."), rest].filter(Boolean).join(".") };
  };
  for (const m of src.matchAll(/^\s*from\s+([.\w]+)\s+import\s+\(?([^)\n#]+)/gm)) {
    const { mod } = resolveDotted(m[1]);
    let hit = false;
    for (const name of m[2].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter((s) => /^\w+$/.test(s))) {
      const sub = pyModule(root, mod ? `${mod}.${name}` : name);
      if (sub) {
        addEdge(f, sub, "import");
        hit = true;
      }
    }
    if (!hit && mod) addEdge(f, pyModule(root, mod), "import");
  }
  for (const m of src.matchAll(/^\s*import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/gm)) {
    for (const dotted of m[1].split(",").map((s) => s.trim())) {
      const parts = dotted.split(".");
      for (let i = parts.length; i > 0; i--) {
        const hit = pyModule(root, parts.slice(0, i).join("."));
        if (hit) {
          addEdge(f, hit, "import");
          break;
        }
      }
    }
  }
}

// ---------------------------------------------------------------- graph: JS / TS imports

/** Parse JSON with comments and trailing commas (tsconfig). Comments inside strings are kept. */
function readJsonc(f) {
  const src = read(f);
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j;
    } else if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && src[i + 1] === "*") {
      i = src.indexOf("*/", i + 2);
      if (i < 0) break;
      i += 1;
    } else out += c;
  }
  try {
    return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
  } catch {
    return null;
  }
}
const tsconfigs = new Map();
for (const f of files.filter((x) => /(^|\/)[tj]sconfig\.json$/.test(x))) {
  const cfg = readJsonc(f);
  const co = cfg?.compilerOptions ?? {};
  const base = posix.join(posix.dirname(f) === "." ? "" : posix.dirname(f), co.baseUrl ?? ".");
  tsconfigs.set(posix.dirname(f) === "." ? "" : posix.dirname(f), { base, paths: co.paths ?? {} });
}
const tsconfigFor = (f) => {
  let d = posix.dirname(f);
  for (;;) {
    const key = d === "." ? "" : d;
    if (tsconfigs.has(key)) return tsconfigs.get(key);
    if (key === "") return null;
    d = posix.dirname(d);
  }
};
const JS_EXTS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".d.ts", "/index.ts", "/index.tsx", "/index.js", "/index.mjs"];
const resolveJs = (spec) => {
  const clean = posix.normalize(spec).replace(/^\.\//, "");
  for (const ext of JS_EXTS) if (fileSet.has(clean + ext)) return clean + ext;
  return null;
};

for (const f of files.filter((x) => CODE_EXT.has(extname(x).toLowerCase()) && !x.endsWith(".py"))) {
  const src = read(f);
  const specs = new Set();
  for (const m of src.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?["']([^"']+)["']/g)) specs.add(m[1]);
  for (const m of src.matchAll(/(?:require|import)\(\s*["']([^"']+)["']\s*\)/g)) specs.add(m[1]);
  for (const spec of specs) {
    let target = null;
    if (spec.startsWith(".")) target = resolveJs(posix.join(posix.dirname(f), spec));
    else {
      const cfg = tsconfigFor(f);
      for (const [pattern, targets] of Object.entries(cfg?.paths ?? {})) {
        const prefix = pattern.replace(/\*$/, "");
        if (pattern.endsWith("*") ? spec.startsWith(prefix) : spec === pattern) {
          const rest = spec.slice(prefix.length);
          for (const t of targets) {
            target = resolveJs(posix.join(cfg.base, t.replace(/\*$/, "") + (pattern.endsWith("*") ? rest : "")));
            if (target) break;
          }
        }
        if (target) break;
      }
    }
    addEdge(f, target, "import");
  }
}

// ---------------------------------------------------------------- graph: Markdown links

for (const f of files.filter((x) => DOC_EXT.has(extname(x).toLowerCase()))) {
  for (const m of read(f).matchAll(/\]\(\s*<?([^)\s>#?]+)[^)]*\)/g)) {
    const link = decodeURI(m[1]);
    if (/^[a-z]+:/i.test(link) || link.startsWith("/")) continue;
    let target = posix.normalize(posix.join(posix.dirname(f), link)).replace(/\/$/, "");
    if (!fileSet.has(target)) {
      target = ["README.md", "ReadMe.md", "readme.md", "index.md"].map((r) => `${target}/${r}`).find((c) => fileSet.has(c)) ?? target;
    }
    addEdge(f, target, "link");
  }
}

// ---------------------------------------------------------------- owners (CODEOWNERS)

const ownersFile = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"].find((f) => fileSet.has(f));
const ownerRules = [];
if (ownersFile) {
  for (const line of read(ownersFile).split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const [pattern, ...owners] = t.split(/\s+/);
    let re = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "\u0000")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]")
      .replace(/\u0000/g, ".*");
    re = re.startsWith("/") ? `^${re.slice(1)}` : `(^|/)${re}`;
    re = re.endsWith("/") ? `${re}` : `${re}(/|$)`;
    ownerRules.push({ re: new RegExp(re), owners: owners.join(" ") || "(none)" });
  }
}
const ownerOf = (f) => {
  let owner = "unowned";
  for (const r of ownerRules) if (r.re.test(f)) owner = r.owners;
  return owner;
};

// ---------------------------------------------------------------- folder groups + communities

const EXPAND = new Set(["modules", "packages", "apps", "services", "projects"]);
function folderOf(f) {
  const parts = posix.dirname(f).split("/").filter((p) => p !== ".");
  if (parts.length === 0) return "(root)";
  let depth = Math.min(parts.length, 3);
  while (depth < parts.length && (EXPAND.has(parts[depth - 1]) || parts[depth - 1].startsWith("["))) depth += 1;
  return parts.slice(0, depth).join("/");
}

const edgeList = [...edges.values()];
const nodeIds = new Set();
for (const f of files) if (kindOf(f) !== "file") nodeIds.add(f);
for (const e of edgeList) {
  nodeIds.add(e.source);
  nodeIds.add(e.target);
}
const nodeList = [...nodeIds].sort();

const neighbours = new Map(nodeList.map((n) => [n, []]));
for (const e of edgeList) {
  neighbours.get(e.source).push(e.target);
  neighbours.get(e.target).push(e.source);
}
// Label propagation (deterministic: sorted order, ties -> smallest label).
const label = new Map(nodeList.map((n) => [n, n]));
for (let iter = 0; iter < 30; iter++) {
  let changed = false;
  for (const n of nodeList) {
    const nb = neighbours.get(n);
    if (!nb.length) continue;
    const count = new Map();
    for (const m of nb) count.set(label.get(m), (count.get(label.get(m)) ?? 0) + 1);
    const best = [...count.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
    if (best !== label.get(n)) {
      label.set(n, best);
      changed = true;
    }
  }
  if (!changed) break;
}
const communityMembers = new Map();
for (const n of nodeList) {
  const l = label.get(n);
  if (!communityMembers.has(l)) communityMembers.set(l, []);
  communityMembers.get(l).push(n);
}
const communities = [...communityMembers.values()].filter((m) => m.length > 1).sort((a, b) => b.length - a.length);
const communityOf = new Map();
communities.forEach((members, i) => members.forEach((m) => communityOf.set(m, `C${i + 1}`)));

const inDeg = new Map(nodeList.map((n) => [n, 0]));
const outDeg = new Map(nodeList.map((n) => [n, 0]));
for (const e of edgeList) {
  outDeg.set(e.source, outDeg.get(e.source) + 1);
  inDeg.set(e.target, inDeg.get(e.target) + 1);
}

const graph = {
  generated: new Date().toISOString(),
  commit,
  repository: repoUrl || null,
  nodes: nodeList.map((id) => ({
    id,
    kind: kindOf(id),
    size: sizes.get(id) ?? 0,
    folder: folderOf(id),
    owner: ownerOf(id),
    community: communityOf.get(id) ?? null,
    in: inDeg.get(id),
    out: outDeg.get(id),
  })),
  edges: edgeList,
};

// ---------------------------------------------------------------- report

const byIn = [...graph.nodes].filter((n) => n.in > 0).sort((a, b) => b.in - a.in || a.id.localeCompare(b.id)).slice(0, 12);
const isolated = graph.nodes.filter((n) => n.kind === "code" && n.in === 0 && n.out === 0).map((n) => n.id);
const ownerPairs = new Map();
const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
for (const e of edgeList.filter((x) => x.type === "import")) {
  const a = nodeById.get(e.source).owner;
  const b = nodeById.get(e.target).owner;
  if (a === b) continue;
  const key = `${a} → ${b}`;
  ownerPairs.set(key, (ownerPairs.get(key) ?? 0) + 1);
}
const report = {
  totals: {
    nodes: graph.nodes.length,
    imports: edgeList.filter((e) => e.type === "import").length,
    links: edgeList.filter((e) => e.type === "link").length,
    communities: communities.length,
  },
  mostDependedOn: byIn.map((n) => ({ id: n.id, in: n.in, owner: n.owner })),
  isolatedCode: isolated,
  crossOwner: [...ownerPairs.entries()].sort((a, b) => b[1] - a[1]).map(([pair, count]) => ({ pair, count })),
  communities: communities.slice(0, 12).map((m, i) => ({
    id: `C${i + 1}`,
    size: m.length,
    folders: [...new Set(m.map(folderOf))].slice(0, 4),
    top: [...m].sort((a, b) => inDeg.get(b) - inDeg.get(a)).slice(0, 4),
  })),
};
graph.report = report;

// ---------------------------------------------------------------- page

const COLORS = {
  ".py": "#3776ab", ".ts": "#3178c6", ".tsx": "#3178c6", ".mjs": "#e0a800", ".js": "#e0a800",
  ".json": "#8b95a5", ".md": "#1f6feb", ".yml": "#cb2d3e", ".yaml": "#cb2d3e", ".toml": "#9c4221",
  ".css": "#7c3aed", ".ps1": "#2a6fb5", ".pdf": "#d4402b", ".ini": "#6b7280", ".mako": "#6b7280",
  ".lock": "#9ca3af", dockerfile: "#2496ed", ".env.example": "#16a34a", ".ico": "#a855f7",
};
const fmt = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const total = tree.size || 1;
const bars = [...byExt.entries()]
  .sort((a, b) => b[1].size - a[1].size)
  .slice(0, 10)
  .map(([ext, v]) => {
    const pct = (v.size / total) * 100;
    return `<div class="bar-row"><span class="bar-label">${esc(ext)}</span><div class="bar-track"><div class="bar" style="width:${pct.toFixed(2)}%;background:${COLORS[ext] ?? "#6b7280"}"></div></div><span class="bar-pct">${pct.toFixed(1)}%</span></div>`;
  })
  .join("\n");
const generated = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
const commitHtml = commit ? (repoUrl ? `<a href="${repoUrl}/commit/${commit}">${commit}</a>` : commit) : "working tree";
const safeJson = (v) => JSON.stringify(v).replace(/</g, "\\u003c");
const jsonName = relative(dirname(OUT), JSON_OUT).split("\\").join("/");

const CLIENT = String.raw`
const TREE = window.__TREE, GRAPH = window.__GRAPH, COLORS = window.__COLORS;
const fmt = (b) => b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(1) + " KB" : (b / 1048576).toFixed(1) + " MB";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const $ = (id) => document.getElementById(id);

// ---- tabs
function show(tab) {
  document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === tab));
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("hidden", p.id !== "panel-" + tab));
  if (tab === "graph") drawGraph();
  try { history.replaceState(null, "", "#" + tab); } catch (e) {}
}
document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => show(b.dataset.tab)));

// ---- tree
const root = $("root");
function renderTree(node, parent, depth) {
  const li = document.createElement("li");
  li.dataset.path = node.path;
  if (node.children) {
    const det = document.createElement("details");
    det.open = depth < 1;
    det.innerHTML = '<summary><span class="folder">📁 ' + esc(node.name) + '</span><span class="size">' + fmt(node.size) + "</span></summary>";
    const ul = document.createElement("ul");
    ul.className = "tree";
    node.children
      .sort((a, b) => (b.children ? 1 : 0) - (a.children ? 1 : 0) || a.name.localeCompare(b.name))
      .forEach((c) => { c.path = node.path ? node.path + "/" + c.name : c.name; renderTree(c, ul, depth + 1); });
    det.appendChild(ul);
    li.appendChild(det);
  } else {
    li.className = "file";
    li.innerHTML = '<span class="dot" style="background:' + (COLORS[node.ext] || "#6b7280") + '"></span><span class="name">' + esc(node.name) + '</span><span class="size">' + fmt(node.size) + "</span>";
  }
  parent.appendChild(li);
}
TREE.children
  .sort((a, b) => (b.children ? 1 : 0) - (a.children ? 1 : 0) || a.name.localeCompare(b.name))
  .forEach((c) => { c.path = c.name; renderTree(c, root, 0); });
const all = (sel) => [...root.querySelectorAll(sel)];
$("expand").onclick = () => all("details").forEach((d) => (d.open = true));
$("collapse").onclick = () => all("details").forEach((d) => (d.open = false));
$("filter").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  all("li").forEach((li) => li.classList.remove("hidden"));
  if (!q) return;
  all("li.file").forEach((li) => { if (!li.dataset.path.toLowerCase().includes(q)) li.classList.add("hidden"); });
  all("li:not(.file)").forEach((li) => {
    const visible = li.querySelector("li.file:not(.hidden)");
    li.classList.toggle("hidden", !visible);
    if (visible) li.querySelector("details").open = true;
  });
});

// ---- graph
const PALETTE = ["#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4f46e5", "#0d9488", "#b45309", "#9333ea", "#be123c", "#0284c7", "#15803d"];
const byId = new Map(GRAPH.nodes.map((n) => [n.id, n]));
const adj = new Map(GRAPH.nodes.map((n) => [n.id, { out: [], in: [] }]));
GRAPH.edges.forEach((e) => { adj.get(e.source).out.push(e); adj.get(e.target).in.push(e); });
let network = null, nodesDS = null, edgesDS = null;

function colorKey(n, mode) { return mode === "owner" ? n.owner : mode === "community" ? (n.community || "(none)") : n.folder; }
function colorMap(mode) {
  const keys = [...new Set(GRAPH.nodes.map((n) => colorKey(n, mode)))].sort();
  const m = new Map();
  keys.forEach((k, i) => m.set(k, k === "(none)" || k === "unowned" ? "#9ca3af" : PALETTE[i % PALETTE.length]));
  return m;
}
function visibleNodes() {
  const docs = $("g-docs").checked, lonely = $("g-isolated").checked;
  return GRAPH.nodes.filter((n) => (docs || n.kind === "code" || (n.kind === "file" && n.in > 0)) && (lonely || n.in + n.out > 0));
}
function legend(cm) {
  $("legend").innerHTML = [...cm.entries()].map(([k, c]) => '<span class="chip"><i style="background:' + c + '"></i>' + esc(k) + "</span>").join("");
}
function drawGraph() {
  if (!window.vis) { $("graph").innerHTML = '<p class="meta">Graph library could not be loaded (offline?). The Tree and Report tabs still work.</p>'; return; }
  const mode = $("g-color").value, cm = colorMap(mode), shown = visibleNodes(), ids = new Set(shown.map((n) => n.id));
  legend(cm);
  const nodes = shown.map((n) => ({
    id: n.id, label: n.id.split("/").pop(), title: n.id,
    shape: n.kind === "doc" ? "box" : n.kind === "file" ? "diamond" : "dot",
    size: 8 + Math.min(22, n.in * 3),
    color: { background: cm.get(colorKey(n, mode)), border: cm.get(colorKey(n, mode)) },
    font: { color: getComputedStyle(document.body).color, size: 12 },
  }));
  const edges = GRAPH.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e, i) => ({
    id: i, from: e.source, to: e.target, arrows: "to", dashes: e.type === "link",
    color: { color: e.type === "link" ? "#9ca3af88" : "#6b728099", highlight: "#f59e0b" },
  }));
  if (network) network.destroy();
  nodesDS = new vis.DataSet(nodes); edgesDS = new vis.DataSet(edges);
  network = new vis.Network($("graph"), { nodes: nodesDS, edges: edgesDS }, {
    height: "100%", width: "100%",
    physics: { solver: "forceAtlas2Based", stabilization: { iterations: 250 }, forceAtlas2Based: { gravitationalConstant: -40, springLength: 90 } },
    interaction: { hover: true, tooltipDelay: 120 },
    edges: { smooth: { type: "continuous" }, width: 1 },
  });
  network.once("stabilizationIterationsDone", () => network.setOptions({ physics: false }));
  network.on("click", (p) => info(p.nodes[0]));
}
function info(id) {
  const box = $("info");
  if (!id) { box.innerHTML = '<p class="meta">Click a node to see what it imports and what depends on it.</p>'; return; }
  const n = byId.get(id), a = adj.get(id);
  const list = (arr, key) => arr.length ? "<ul>" + arr.map((e) => '<li><a href="#" data-node="' + esc(e[key]) + '">' + esc(e[key]) + "</a>" + (e.type === "link" ? " <em>(link)</em>" : "") + "</li>").join("") + "</ul>" : '<p class="meta">none</p>';
  box.innerHTML = "<h3>" + esc(id) + "</h3>" +
    '<p class="meta">' + esc(n.kind) + " · " + fmt(n.size) + " · folder " + esc(n.folder) + "<br>owner " + esc(n.owner) + (n.community ? " · community " + n.community : "") + "</p>" +
    "<h4>Depends on (" + a.out.length + ")</h4>" + list(a.out, "target") +
    "<h4>Used by (" + a.in.length + ")</h4>" + list(a.in, "source");
  box.querySelectorAll("a[data-node]").forEach((l) => (l.onclick = (ev) => { ev.preventDefault(); focusNode(l.dataset.node); }));
}
function focusNode(id) {
  if (!network || !nodesDS.get(id)) { info(id); return; }
  network.selectNodes([id]); network.focus(id, { scale: 1.2, animation: true }); info(id);
}
["g-color", "g-docs", "g-isolated"].forEach((id) => ($(id).onchange = drawGraph));
function findNode() {
  const q = $("g-search").value.trim().toLowerCase();
  const hit = q && (GRAPH.nodes.find((n) => n.id.toLowerCase().endsWith(q)) || GRAPH.nodes.find((n) => n.id.toLowerCase().includes(q)));
  if (hit) focusNode(hit.id);
}
$("g-search").addEventListener("keydown", (e) => { if (e.key === "Enter") findNode(); });
$("g-search").addEventListener("search", findNode);
info(null);

// ---- report
const R = GRAPH.report;
const rows = (arr, f) => arr.length ? arr.map(f).join("") : '<tr><td class="meta">none</td></tr>';
$("panel-report").innerHTML =
  '<div class="cards">' +
  ["nodes", "imports", "links", "communities"].map((k) => '<div class="card"><b>' + R.totals[k] + "</b><span>" + k + "</span></div>").join("") + "</div>" +
  "<h3>Most depended-on files</h3><p class=\"meta\">Changing these affects the most other files – review carefully.</p><table>" +
  rows(R.mostDependedOn, (n) => '<tr><td><a href="#graph" data-node="' + esc(n.id) + '">' + esc(n.id) + "</a></td><td>" + n.in + " dependents</td><td class=\"meta\">" + esc(n.owner) + "</td></tr>") + "</table>" +
  "<h3>Dependencies between owners</h3><p class=\"meta\">Imports that cross module boundaries – coordinate changes here.</p><table>" +
  rows(R.crossOwner, (p) => "<tr><td>" + esc(p.pair) + "</td><td>" + p.count + " imports</td></tr>") + "</table>" +
  "<h3>Communities</h3><p class=\"meta\">Groups of files that import each other (label propagation).</p><table>" +
  rows(R.communities, (c) => "<tr><td>" + c.id + " · " + c.size + " files</td><td>" + c.folders.map(esc).join(", ") + '</td><td class="meta">' + c.top.map(esc).join(", ") + "</td></tr>") + "</table>" +
  "<h3>Isolated code files</h3><p class=\"meta\">No imports in or out – entry points, scripts or dead code.</p><table>" +
  rows(R.isolatedCode, (id) => "<tr><td>" + esc(id) + "</td></tr>") + "</table>";
document.querySelectorAll("#panel-report a[data-node]").forEach((l) => (l.onclick = (ev) => { ev.preventDefault(); show("graph"); setTimeout(() => focusNode(l.dataset.node), 400); }));

show((location.hash || "#tree").slice(1).replace(/[^a-z]/g, "") || "tree");
`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(TITLE)} · Codebase map</title>
<script src="https://cdn.jsdelivr.net/npm/vis-network@10.1.2/standalone/umd/vis-network.min.js" defer></script>
<style>
  :root { --bg:#f7f7f8; --panel:#ffffff; --border:#e3e3e8; --text:#1c1c22; --muted:#6b6b76; --hover:#efeff3; --folder:#a16207; --accent:#2563eb; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#16161d; --panel:#1f1f29; --border:#32323f; --text:#ececf1; --muted:#9a9aa8; --hover:#2a2a37; --folder:#f5c542; --accent:#60a5fa; }
  }
  * { box-sizing:border-box; }
  body { margin:0; font:14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; background:var(--bg); color:var(--text); }
  a { color:inherit; }
  .layout { display:flex; min-height:100vh; }
  aside { width:300px; flex-shrink:0; background:var(--panel); border-right:1px solid var(--border); padding:20px; }
  main { flex:1; padding:16px 24px; min-width:0; display:flex; flex-direction:column; }
  h1 { font-size:18px; margin:0 0 4px; }
  h2 { font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:22px 0 8px; }
  h3 { font-size:15px; margin:22px 0 4px; }
  h4 { font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); margin:14px 0 4px; }
  .meta { color:var(--muted); font-size:12px; margin:0; }
  .stat { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border); }
  .stat b { font-variant-numeric:tabular-nums; }
  .bar-row { display:flex; align-items:center; gap:8px; margin:6px 0; font-size:12px; }
  .bar-label { width:84px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .bar-track { flex:1; height:10px; background:var(--hover); border-radius:5px; overflow:hidden; }
  .bar { height:100%; border-radius:5px; }
  .bar-pct { width:44px; text-align:right; color:var(--muted); font-variant-numeric:tabular-nums; }
  .tabs { display:flex; gap:4px; border-bottom:1px solid var(--border); margin-bottom:12px; }
  .tab { padding:8px 14px; border:0; border-bottom:2px solid transparent; background:none; color:var(--muted); cursor:pointer; font:inherit; }
  .tab[aria-selected="true"] { color:var(--text); border-bottom-color:var(--accent); font-weight:600; }
  .toolbar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin:0 0 10px; }
  .toolbar input[type=search], .toolbar select { padding:7px 10px; border:1px solid var(--border); border-radius:8px; background:var(--panel); color:var(--text); font:inherit; }
  .toolbar input[type=search] { flex:1; min-width:180px; }
  .toolbar button { padding:7px 12px; border:1px solid var(--border); border-radius:8px; background:var(--panel); color:var(--text); cursor:pointer; font:inherit; }
  .toolbar label { font-size:13px; color:var(--muted); display:flex; gap:4px; align-items:center; }
  ul.tree { list-style:none; margin:0; padding-left:18px; }
  #root { padding-left:0; }
  summary { cursor:pointer; padding:3px 8px; border-radius:6px; display:flex; gap:8px; }
  summary:hover, .file:hover { background:var(--hover); }
  .folder { color:var(--folder); font-weight:500; }
  .file { display:flex; align-items:center; gap:8px; padding:3px 8px; border-radius:6px; }
  .dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
  .size { margin-left:auto; color:var(--muted); font-size:12px; font-variant-numeric:tabular-nums; }
  .graph-wrap { display:flex; gap:12px; }
  /* Fixed height: vis-network keeps growing a canvas whose container has no fixed height. */
  #graph { flex:1; min-width:0; height:72vh; min-height:480px; border:1px solid var(--border); border-radius:10px; background:var(--panel); }
  #info { width:300px; flex-shrink:0; border:1px solid var(--border); border-radius:10px; background:var(--panel); padding:12px 14px; overflow:auto; height:72vh; min-height:480px; font-size:13px; }
  #info h3 { margin:0 0 4px; font-size:14px; word-break:break-all; }
  #info ul { margin:0; padding-left:16px; } #info li { word-break:break-all; }
  #legend { display:flex; flex-wrap:wrap; gap:6px 12px; margin:0 0 10px; font-size:12px; color:var(--muted); }
  .chip { display:flex; align-items:center; gap:5px; } .chip i { width:10px; height:10px; border-radius:50%; display:inline-block; }
  .cards { display:flex; gap:10px; flex-wrap:wrap; }
  .card { background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:10px 16px; min-width:120px; }
  .card b { display:block; font-size:22px; font-variant-numeric:tabular-nums; } .card span { color:var(--muted); font-size:12px; }
  table { border-collapse:collapse; width:100%; background:var(--panel); border:1px solid var(--border); border-radius:10px; overflow:hidden; margin-top:6px; }
  td { padding:6px 10px; border-top:1px solid var(--border); font-size:13px; word-break:break-all; } tr:first-child td { border-top:0; }
  .hidden { display:none !important; }
  @media (max-width: 860px) { .layout { flex-direction:column; } aside { width:auto; border-right:0; border-bottom:1px solid var(--border); } .graph-wrap { flex-direction:column; } #info { width:auto; height:auto; max-height:50vh; } #graph { height:60vh; } }
</style>
</head>
<body>
<div class="layout">
  <aside>
    <h1>${esc(TITLE)}</h1>
    <p class="meta">Codebase map · commit ${commitHtml}<br>Generated ${generated}</p>
    <h2>Summary</h2>
    <div class="stat"><span>Files</span><b>${files.length.toLocaleString("en")}</b></div>
    <div class="stat"><span>Folders</span><b>${dirCount.toLocaleString("en")}</b></div>
    <div class="stat"><span>Total size</span><b>${fmt(tree.size)}</b></div>
    <div class="stat"><span>Graph nodes / edges</span><b>${graph.nodes.length} / ${edgeList.length}</b></div>
    <h2>Size by file type</h2>
    ${bars}
    <h2>About</h2>
    <p class="meta">Only files tracked by git – no .env, virtual environments, node_modules or build output.
    Edges come from Python and JS/TS imports and relative Markdown links, parsed without any AI.
    Graph data: <a href="${esc(jsonName)}">${esc(basename(JSON_OUT))}</a>${repoUrl ? ` · <a href="${repoUrl}">Repository</a>` : ""}</p>
  </aside>
  <main>
    <div class="tabs" role="tablist">
      <button class="tab" role="tab" data-tab="tree">Tree</button>
      <button class="tab" role="tab" data-tab="graph">Graph</button>
      <button class="tab" role="tab" data-tab="report">Report</button>
    </div>
    <section class="panel" id="panel-tree">
      <div class="toolbar">
        <input id="filter" type="search" placeholder="Filter files, e.g. alembic or .tsx" aria-label="Filter files">
        <button type="button" id="expand">Expand all</button>
        <button type="button" id="collapse">Collapse all</button>
      </div>
      <ul class="tree" id="root"></ul>
    </section>
    <section class="panel hidden" id="panel-graph">
      <div class="toolbar">
        <input id="g-search" type="search" placeholder="Find a file and press Enter" aria-label="Find a file">
        <label>Colour by <select id="g-color"><option value="folder">folder</option><option value="owner">owner</option><option value="community">community</option></select></label>
        <label><input type="checkbox" id="g-docs" checked> docs &amp; links</label>
        <label><input type="checkbox" id="g-isolated"> isolated files</label>
      </div>
      <div id="legend"></div>
      <div class="graph-wrap"><div id="graph"></div><div id="info"></div></div>
    </section>
    <section class="panel hidden" id="panel-report"></section>
  </main>
</div>
<script>window.__TREE = ${safeJson(plainTree(tree))}; window.__GRAPH = ${safeJson(graph)}; window.__COLORS = ${safeJson(COLORS)};</script>
<script>window.addEventListener("DOMContentLoaded", () => {${CLIENT}});</script>
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html, "utf8");
writeFileSync(JSON_OUT, JSON.stringify(graph, null, 2) + "\n", "utf8");
console.log(
  `codebase map: ${files.length} files, ${dirCount} folders, graph ${graph.nodes.length} nodes / ${edgeList.length} edges -> ${OUT}`,
);
