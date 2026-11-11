#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
reorganize_cleanup.py — إعادة تنظيم MarketPlat وحذف الملفات الميتة وغير المستخدمة.

يعمل من جذر المشروع (python3 reorganize_cleanup.py) ولا يحتاج أي مكتبة خارجية.

الوضع الافتراضي هو DRY-RUN: يحلل ويكتب التقرير فقط ولا يلمس أي ملف.
للتنفيذ الفعلي أضف  --apply . الملفات المحذوفة تُنقل إلى مجلد سلة خارج
المشروع (../<اسم-المجلد>.cleanup-trash/<تاريخ>) ما لم تستعمل --no-trash.

ماذا يفعل (بالترتيب):
  1) junk      ملفات مخلّفات (نواتج أدوات، lock قديم، .gitignore شاردة، .DS_Store ...).
  2) scripts   سكربتات تدقيق/تحقق لمرة واحدة (audit / phase / inventory / legacy-verifications)
               غير مستعملة في CI أو Docker أو الاختبارات، مع تنظيف package.json والـ manifests.
  3) dead-code ملفات مصدر يتيمة (Next.js web / React Native / Express API) بتحليل رسم الاستيراد
               (alias + relative + dynamic + mock + string-path) مع حماية بالإشارات النصية.
               الاختبارات التي لا تغطي إلا ملفات ميتة تُحذف معها.
  4) docs      نقل التقارير التاريخية إلى docs/archive/{web,api,mobile,root} وتجميع وثائق الجذر
               في docs/{architecture,operations,...} وإصلاح الروابط النسبية في ملفات md.
  5) tools     دمج tooling/ داخل tools/ ونقل probe السكربت الشارد، مع إعادة كتابة المراجع.
  6) empty     حذف المجلدات الفارغة.

ما لا يفعله عمدًا:
  - لا ينقل frontend/ إلى apps/web (إعدادات النشر خارج المستودع — Cloudflare/Docker/CI — تشير إليه).
  - لا يعيد ترتيب مجلدات الكود الداخلية (يحتاج بناء/اختبارات للتحقق).

أمثلة:
  python3 reorganize_cleanup.py                      # dry-run + تقرير
  python3 reorganize_cleanup.py --apply              # تنفيذ (مع سلة)
  python3 reorganize_cleanup.py --apply --no-trash   # حذف نهائي
  python3 reorganize_cleanup.py --apply --skip-code  # بدون حذف الكود اليتيم
  python3 reorganize_cleanup.py --apply --purge-archive   # حذف التقارير التاريخية بدل أرشفتها
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import posixpath
import re
import shutil
import sys
from collections import defaultdict
from pathlib import Path

# ──────────────────────────────────────────────────────────────────────────────
# ثوابت
# ──────────────────────────────────────────────────────────────────────────────
SKIP_DIRS = {
    "node_modules", ".git", ".next", ".turbo", ".expo", ".wrangler", ".open-next",
    "dist", "build", "coverage", "__pycache__", ".gradle", "Pods", ".cache", ".vite",
}
CODE_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"}
TEXT_EXT = CODE_EXT | {
    ".json", ".jsonc", ".yml", ".yaml", ".toml", ".sh", ".css", ".scss", ".html",
    ".py", ".md", ".txt", ".env", ".example", ".gradle", ".properties", ".csv",
}
TEXT_NAMES = {"Dockerfile", ".dockerignore", ".gitignore", ".npmrc", ".clineignore", "Makefile"}
RESOLVE_EXT = [
    ".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts",
    ".json", ".css", ".scss", ".svg", ".png", ".webp", ".jpg", ".jpeg", ".gif",
    ".ttf", ".otf", ".woff", ".woff2", ".mp3", ".wav", ".md", ".sql",
]
PLATFORM_SUFFIX = ["", ".native", ".ios", ".android", ".web"]
MAX_READ = 2_000_000

# مشاريع الكود (الجذر → alias)
PROJECTS = {
    "frontend": {"@/": "frontend/"},
    "apps/mobile": {"@/": "apps/mobile/src/"},
    "apps/api": {"@/": "apps/api/src/"},
}
# مجلدات المرشحين للحذف داخل كل مشروع (الباقي يُعد كله نقاط دخول/إعدادات)
CANDIDATE_DIRS = {
    "frontend": ["app", "components", "hooks", "lib", "providers", "store", "api", "types"],
    "apps/mobile": ["src"],
    "apps/api": ["src"],
}
# نقاط دخول Next.js داخل app/
NEXT_SPECIAL = {
    "page", "layout", "route", "loading", "error", "global-error", "not-found", "template",
    "default", "sitemap", "robots", "manifest", "icon", "apple-icon", "opengraph-image",
    "twitter-image", "instrumentation", "instrumentation-client", "middleware",
}
TEST_RE = re.compile(
    r"(^|/)(__tests__|__mocks__|tests?|e2e|test-support|__fixtures__)(/|$)|\.(test|spec)\.[cm]?[jt]sx?$"
)
# سكربتات التدقيق التي يجوز حذفها إذا لم يستعملها أحد
AUDIT_FILE_RE = re.compile(r"(audit|inventory|guardrail|phase\d)", re.I)
AUDIT_KEY_RE = re.compile(r"(audit|inventory|phase|guardrail|verify)", re.I)
GENERIC_STEMS = {
    "index", "types", "type", "utils", "util", "constants", "config", "schema", "client",
    "server", "store", "api", "hooks", "hook", "helpers", "common", "shared", "base",
    "default", "main", "app", "layout", "page", "route", "error", "loading", "context",
    "provider", "providers", "styles", "theme", "colors", "index.web", "index.native",
}
# أرشفة التقارير التاريخية
HIST_RE = re.compile(
    r"(PHASE|ROUND|AUDIT|OPTIMIZATION|REPAIR|REPORT|APPLY|REMAINING|CHANGELOG|INVENTORY|"
    r"REDUCTION|ROOT[_-]CAUSE|REORGANIZATION|CLEANUP|CONSISTENCY|UNIFICATION|\d{4}-\d{2}-\d{2}|"
    r"GROUP-\d|-phase\d|FAILOVER)",
    re.I,
)
JUNK_NAMES = {".DS_Store", "Thumbs.db", "desktop.ini"}
JUNK_SUFFIX = (".log", ".bak", ".orig", ".rej", ".swp", ".swo", ".tsbuildinfo", ".pyc", "~")
ROOT_JUNK = [
    # (مسار, سبب)
    ("marketplat-audit.json", "مخرجات فحص لمرة واحدة (193KB) — يُولَّد من audit_marketplat.py"),
    ("audit_marketplat.py", "سكربت فحص لمرة واحدة ينتج marketplat-audit.json"),
    ("package-lock.json", "lock قديم بالجذر؛ المشروع pnpm والجذر بلا dependencies"),
    ("frontend.gitignore", ".gitignore شاردة بالجذر؛ الأصلي frontend/.gitignore"),
    ("workers/cf-api-proxy.gitignore", ".gitignore شاردة؛ الأصلي workers/cf-api-proxy/.gitignore"),
]

# نقل ملفات وثائق الجذر → docs/…
ROOT_DOC_MOVES = {
    "APPWRITE-DEPLOYMENT-AR.md": "docs/operations/APPWRITE-DEPLOYMENT-AR.md",
    "CACHE-ANALYTICS-OPERATIONS-AR.md": "docs/operations/CACHE-ANALYTICS-OPERATIONS-AR.md",
    "REDIS-MULTISERVICE-IMPLEMENTATION-AR.md": "docs/operations/REDIS-MULTISERVICE-IMPLEMENTATION-AR.md",
    "GO_WORKER_FAILOVER_PHASE5_AR.md": "docs/backend/GO_WORKER_FAILOVER_PHASE5_AR.md",
    "GO_WORKER_FAILOVER_PHASE6_AR.md": "docs/backend/GO_WORKER_FAILOVER_PHASE6_AR.md",
    "MONOREPO_MIGRATION_PLAN_AR.md": "docs/architecture/MONOREPO_MIGRATION_PLAN_AR.md",
    "README_MONOREPO_AR.md": "docs/architecture/README_MONOREPO_AR.md",
    "README_AR.md": "docs/README_AR.md",
    "TECH_DEBT.md": "docs/TECH_DEBT.md",
    "OFFLINE_SYSTEM_PHASE1_INVENTORY.md": "docs/archive/root/OFFLINE_SYSTEM_PHASE1_INVENTORY.md",
    "README-BANDWIDTH-PROBE-AR.md": "tools/bandwidth-probe/README-AR.md",
    "marketplat_bandwidth_probe.py": "tools/bandwidth-probe/marketplat_bandwidth_probe.py",
}
# وثائق docs/ الحالية
DOCS_DIR_MOVES = {
    "docs/CACHE_LAYERS_ARCHITECTURE.md": "docs/architecture/CACHE_LAYERS_ARCHITECTURE.md",
    "docs/CLOUDFLARE-CACHE-SETUP-AR.md": "docs/operations/CLOUDFLARE-CACHE-SETUP-AR.md",
    "docs/social-follow-system.md": "docs/features/social-follow-system.md",
    "docs/stories-system.md": "docs/features/stories-system.md",
}
DOCS_ARCHIVE_PREFIXES = ("docs/PHASE", "docs/TEST_REPAIR")

SCRIPT_DIRS = ["frontend/scripts", "apps/api/scripts"]


# ──────────────────────────────────────────────────────────────────────────────
# أدوات
# ──────────────────────────────────────────────────────────────────────────────
def log(msg: str = "") -> None:
    print(msg, flush=True)


def human(n: int) -> str:
    f = float(n)
    for u in ("B", "KB", "MB", "GB"):
        if f < 1024 or u == "GB":
            return f"{f:.0f}{u}" if u == "B" else f"{f:.1f}{u}"
        f /= 1024
    return f"{n}B"


def is_text(rel: str) -> bool:
    base = posixpath.basename(rel)
    return base in TEXT_NAMES or posixpath.splitext(base)[1].lower() in TEXT_EXT or base.startswith("Dockerfile")


def is_code(rel: str) -> bool:
    return posixpath.splitext(rel)[1].lower() in CODE_EXT


def is_test(rel: str) -> bool:
    return bool(TEST_RE.search(rel))


def project_of(rel: str) -> str | None:
    best = None
    for root in PROJECTS:
        if rel == root or rel.startswith(root + "/"):
            if best is None or len(root) > len(best):
                best = root
    return best


_BLOCK_C = re.compile(r"/\*.*?\*/", re.S)
_LINE_C = re.compile(r"(?m)(^|[\s;,{}()])//[^\n]*")


def strip_comments(t: str, rel: str) -> str:
    if posixpath.splitext(rel)[1].lower() in CODE_EXT | {".css", ".scss"}:
        t = _BLOCK_C.sub(" ", t)
        t = _LINE_C.sub(r"\1", t)
    return t


def stem_of(rel: str) -> str:
    base = posixpath.basename(rel)
    for ext in (".d.ts",):
        if base.endswith(ext):
            return base[: -len(ext)]
    base = posixpath.splitext(base)[0]
    # useFoo.native → useFoo
    base = re.sub(r"\.(native|ios|android|web)$", "", base)
    return base


# ──────────────────────────────────────────────────────────────────────────────
# فهرس المشروع
# ──────────────────────────────────────────────────────────────────────────────
class Repo:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.files: dict[str, int] = {}   # rel → size
        self._text: dict[str, str] = {}
        self.scan()

    def scan(self) -> None:
        self.files.clear()
        self._text.clear()
        for base, dirs, names in os.walk(self.root):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for n in names:
                p = Path(base) / n
                rel = p.relative_to(self.root).as_posix()
                if n in ("CLEANUP_REPORT.md", "CLEANUP_REPORT.json", "reorganize_cleanup.py"):
                    continue
                try:
                    self.files[rel] = p.stat().st_size
                except OSError:
                    continue

    def text(self, rel: str) -> str:
        if rel in self._text:
            return self._text[rel]
        t = ""
        if rel in self.files and self.files[rel] <= MAX_READ and is_text(rel):
            try:
                t = (self.root / rel).read_text(encoding="utf-8", errors="replace")
            except OSError:
                t = ""
        self._text[rel] = t
        return t

    def drop(self, rels) -> None:
        for r in rels:
            self.files.pop(r, None)
            self._text.pop(r, None)


# ──────────────────────────────────────────────────────────────────────────────
# محلل الاستيرادات
# ──────────────────────────────────────────────────────────────────────────────
SPEC_RES = [
    re.compile(r"""\b(?:from|import)\s*\(?\s*['"]([^'"\n]+)['"]"""),
    re.compile(r"""\brequire(?:\.resolve)?\s*\(\s*['"]([^'"\n]+)['"]"""),
    re.compile(r"""\b(?:mock|doMock|unmock|importActual|importMock|requireActual|requireMock)\s*\(\s*['"]([^'"\n]+)['"]"""),
    re.compile(r"""new\s+URL\(\s*['"]([^'"\n]+)['"]\s*,\s*import\.meta\.url"""),
    re.compile(r"""@(?:import|config|plugin|source)\s+['"]([^'"\n]+)['"]"""),
]
DYN_DIR_RE = re.compile(r"""import\(\s*`([^`$]*)\$\{""")
STRING_RE = re.compile(r"""['"`]([^'"`\n]{3,220})['"`]""")


class Graph:
    def __init__(self, repo: Repo):
        self.repo = repo
        self.edges: dict[str, set[str]] = defaultdict(set)       # import-based
        self.sedges: dict[str, set[str]] = defaultdict(set)      # string-path based
        self.dyn_dirs: set[str] = set()
        self.unresolved_aliases: list[tuple[str, str]] = []

    # ---- resolution ---------------------------------------------------------
    def _try(self, base: str) -> list[str]:
        files = self.repo.files
        out: list[str] = []
        base = posixpath.normpath(base)
        if base in files:
            out.append(base)
        stripped = re.sub(r"\.(m|c)?js$", "", base) if re.search(r"\.(m|c)?js$", base) else None
        bases = [base] + ([stripped] if stripped else [])
        for b in bases:
            for suf in PLATFORM_SUFFIX:
                for ext in RESOLVE_EXT:
                    c = f"{b}{suf}{ext}"
                    if c in files and c not in out:
                        out.append(c)
                    c = f"{b}/index{suf}{ext}"
                    if c in files and c not in out:
                        out.append(c)
            if out:
                break
        return out

    def resolve(self, spec: str, from_file: str) -> list[str]:
        spec = spec.split("?")[0].split("#")[0]
        if not spec:
            return []
        proj = project_of(from_file)
        if spec.startswith("."):
            return self._try(posixpath.join(posixpath.dirname(from_file), spec))
        if proj:
            for prefix, target in PROJECTS[proj].items():
                if spec.startswith(prefix):
                    return self._try(target + spec[len(prefix):])
        return []  # حزمة npm أو شيء غير محلي

    # ---- بناء الرسم --------------------------------------------------------
    def build(self) -> None:
        files = self.repo.files
        for rel in list(files):
            if not is_text(rel):
                continue
            ext = posixpath.splitext(rel)[1].lower()
            if ext in CODE_EXT or ext in {".css", ".scss"}:
                t = self.repo.text(rel)
                if not t:
                    continue
                for rx in SPEC_RES:
                    for m in rx.finditer(t):
                        for tgt in self.resolve(m.group(1), rel):
                            if tgt != rel:
                                self.edges[rel].add(tgt)
                for m in DYN_DIR_RE.finditer(t):
                    d = posixpath.normpath(posixpath.join(posixpath.dirname(rel), m.group(1)))
                    self.dyn_dirs.add(d if m.group(1).endswith("/") else posixpath.dirname(d))
            # مسارات نصية (سكربتات، اختبارات تقرأ ملفات، إعدادات)
            if ext in CODE_EXT | {".json", ".jsonc", ".yml", ".yaml", ".toml", ".sh", ".html"}:
                t = self.repo.text(rel)
                if not t:
                    continue
                proj = project_of(rel)
                dirn = posixpath.dirname(rel)
                for m in STRING_RE.finditer(t):
                    lit = m.group(1).strip()
                    if "/" not in lit and "." not in lit:
                        continue
                    if " " in lit or lit.startswith(("http:", "https:", "data:", "node:")):
                        continue
                    lit2 = lit[2:] if lit.startswith("./") else lit
                    cands = [posixpath.join(dirn, lit2), lit2]
                    if proj:
                        cands.append(posixpath.join(proj, lit2))
                    for c in cands:
                        c = posixpath.normpath(c)
                        if c in files and c != rel and not c.endswith("/"):
                            self.sedges[rel].add(c)
                            break

    def all_edges(self, f: str) -> set[str]:
        return self.edges.get(f, set()) | self.sedges.get(f, set())

    def reach(self, entries: set[str], skip: set[str] | None = None) -> set[str]:
        skip = skip or set()
        seen: set[str] = set()
        stack = [e for e in entries if e in self.repo.files and e not in skip]
        # استيراد ديناميكي بقالب: كل ما تحت المجلد يُعد نقطة دخول
        for d in self.dyn_dirs:
            pref = d.rstrip("/") + "/"
            stack.extend(f for f in self.repo.files if f.startswith(pref) and f not in skip)
        while stack:
            f = stack.pop()
            if f in seen:
                continue
            seen.add(f)
            for t in self.all_edges(f):
                if t not in seen and t not in skip:
                    stack.append(t)
        return seen


# ──────────────────────────────────────────────────────────────────────────────
# خطة العمل
# ──────────────────────────────────────────────────────────────────────────────
class Plan:
    def __init__(self):
        self.deletes: dict[str, tuple[str, str]] = {}      # rel → (category, reason)
        self.moves: dict[str, tuple[str, str]] = {}        # src → (dst, category)
        self.notes: list[str] = []
        self.kept_audit: list[str] = []
        self.pkg_removed: dict[str, list[str]] = {}

    def delete(self, rel: str, cat: str, why: str) -> None:
        self.deletes.setdefault(rel, (cat, why))

    def move(self, src: str, dst: str, cat: str) -> None:
        if src != dst:
            self.moves[src] = (dst, cat)


def phase_junk(repo: Repo, plan: Plan) -> None:
    for rel, why in ROOT_JUNK:
        if rel in repo.files:
            plan.delete(rel, "junk", why)
    for rel in repo.files:
        base = posixpath.basename(rel)
        if base in JUNK_NAMES or base.endswith(JUNK_SUFFIX):
            plan.delete(rel, "junk", "ملف مخلّفات/ملف مؤقت")
        elif re.search(r"(^|/)(test-results|playwright-report)/", rel):
            plan.delete(rel, "junk", "مخرجات Playwright/اختبارات مولّدة")
    # test-results فارغ سيُحذف ضمن المجلدات الفارغة


# ---- package.json ---------------------------------------------------------------
def load_pkg(repo: Repo, rel: str):
    try:
        return json.loads(repo.text(rel))
    except Exception:
        return None


def pkg_dirs(repo: Repo) -> dict[str, str]:
    """اسم الحزمة → مجلدها، ومجلدات بلا اسم أيضًا."""
    out = {}
    for rel in repo.files:
        if posixpath.basename(rel) == "package.json" and "node_modules" not in rel:
            d = load_pkg(repo, rel)
            if isinstance(d, dict) and d.get("name"):
                out[d["name"]] = posixpath.dirname(rel)
    return out


CMD_FILE_RE = re.compile(r"[\w@./-]+\.(?:mjs|cjs|js|ts|sh|py)\b")
NPM_RUN_RE = re.compile(
    r"\b(?:npm|pnpm|yarn)\b((?:\s+(?:--prefix|--filter|-C|-F)\s+\S+)*)\s+(?:run\s+)?([\w:.-]+)"
)


def command_refs(cmd: str, pkg_dir: str, names: dict[str, str]) -> tuple[set[str], set[tuple[str, str]]]:
    """(ملفات مشار إليها نسبة للجذر، [(مجلد الحزمة, اسم سكربت)])."""
    files: set[str] = set()
    runs: set[tuple[str, str]] = set()
    for part in re.split(r"&&|\|\||;|\|", cmd):
        part = part.strip()
        for m in CMD_FILE_RE.finditer(part):
            lit = m.group(0)
            lit = lit[2:] if lit.startswith("./") else lit
            files.add(posixpath.normpath(posixpath.join(pkg_dir, lit)))
            files.add(posixpath.normpath(lit))
        m = NPM_RUN_RE.search(part)
        if m:
            opts, name = m.group(1) or "", m.group(2)
            if name in {"install", "i", "ci", "exec", "dlx", "add", "remove", "run"}:
                continue
            d = pkg_dir
            pm = re.search(r"--prefix\s+(\S+)", opts)
            fm = re.search(r"(?:--filter|-F)\s+(\S+)", opts)
            if pm:
                d = posixpath.normpath(posixpath.join(pkg_dir, pm.group(1)))
            elif fm:
                d = names.get(fm.group(1), d)
            runs.add((d, name))
    return files, runs


def phase_scripts(repo: Repo, g: Graph, plan: Plan) -> None:
    names = pkg_dirs(repo)
    pkgs: dict[str, dict] = {}
    for rel in repo.files:
        if posixpath.basename(rel) == "package.json" and "node_modules" not in rel:
            d = load_pkg(repo, rel)
            if isinstance(d, dict):
                pkgs[posixpath.dirname(rel)] = d

    # ---------- موبايل: legacy + quarantined ----------
    mob = "apps/mobile/scripts"
    for rel in list(repo.files):
        if rel.startswith(mob + "/legacy-verifications/"):
            plan.delete(rel, "scripts", "تحقق تاريخي معزول (quarantined) — فاشل ولا يُحتسب كنجاح")
    q = repo.text(f"{mob}/quarantined-active.json")
    if q:
        try:
            for e in json.loads(q).get("entries", []):
                f = e.get("file")
                rel = f"{mob}/{f}"
                if f and rel in repo.files:
                    plan.delete(rel, "scripts", "تحقق معزول فاشل (quarantined-active.json) خارج مجموعة التشغيل")
        except Exception:
            plan.notes.append("تعذر قراءة quarantined-active.json")

    # ---------- web / api: سكربتات التدقيق ----------
    cand: set[str] = set()
    for d in SCRIPT_DIRS:
        for rel in repo.files:
            if rel.startswith(d + "/") and "/__tests__/" not in rel:
                base = posixpath.basename(rel)
                if AUDIT_FILE_RE.search(base) and re.search(r"\.(mjs|cjs|js|sh|md|csv)$", base):
                    cand.add(rel)

    # corpus الحي: كل نص خارج المرشحين، وعدا الوثائق، + workflows + Dockerfile
    live_texts: dict[str, str] = {}
    for rel in repo.files:
        if rel in cand or rel in plan.deletes or not is_text(rel):
            continue
        if rel.endswith(".md") or rel.endswith(".csv"):
            continue
        if posixpath.basename(rel) in {"package.json", "package-lock.json", "pnpm-lock.yaml"}:
            continue
        live_texts[rel] = repo.text(rel)
    # package.json: سكربتات حيّة = غير تدقيقية، أو مذكورة بالاسم في CI/Docker/كود حي، أو مستدعاة من حي
    tokset: set[str] = set()
    tok_cmd = re.compile(r"[\w:.-]+")
    for rel, t in live_texts.items():
        tokset |= {x.strip(".-:") for x in tok_cmd.findall(t)}
    live_keys: set[tuple[str, str]] = set()
    for pdir, d in pkgs.items():
        for k in (d.get("scripts") or {}):
            if not AUDIT_KEY_RE.search(k) or k in tokset:
                live_keys.add((pdir, k))
    changed = True
    while changed:
        changed = False
        for pdir, k in list(live_keys):
            cmd = (pkgs[pdir].get("scripts") or {}).get(k, "")
            _, runs = command_refs(cmd, pdir, names)
            for r in runs:
                if r not in live_keys and r[1] in (pkgs.get(r[0], {}).get("scripts") or {}):
                    live_keys.add(r)
                    changed = True
    for pdir, k in live_keys:
        live_texts[f"{pdir}/package.json#{k}"] = pkgs[pdir]["scripts"][k]

    def referenced(c: str, kept: set[str]) -> bool:
        base = posixpath.basename(c)
        for rel, t in live_texts.items():
            if rel == c:
                continue
            if base in t:
                return True
        for k in kept:
            if k != c and base in repo.text(k):
                return True
        return False

    kept: set[str] = set()
    changed = True
    while changed:
        changed = False
        for c in sorted(cand):
            if c in kept:
                continue
            if referenced(c, kept):
                kept.add(c)
                changed = True
    for c in sorted(cand - kept):
        plan.delete(c, "scripts", "سكربت تدقيق لمرة واحدة غير مستعمل في CI/Docker/الاختبارات")
    plan.kept_audit = sorted(kept)

    # ملفات مساعدة يتيمة داخل scripts بعد الحذف (lib/…)
    deleted = {r for r, (c, _) in plan.deletes.items() if c == "scripts"}
    for d in SCRIPT_DIRS:
        for rel in list(repo.files):
            if not rel.startswith(d + "/lib/") or rel in plan.deletes:
                continue
            base = posixpath.basename(rel)
            stem = stem_of(rel)
            used = False
            for other, t in live_texts.items():
                if other.startswith(d + "/lib/") or other in deleted:
                    continue
                if stem in t:
                    used = True
                    break
            if not used:
                for k in kept:
                    if stem in repo.text(k):
                        used = True
                        break
            if not used:
                plan.delete(rel, "scripts", "مساعد scripts/lib لا يستعمله أي سكربت متبقٍ")

    # ---------- تنظيف package.json: إزالة أي أمر يشير لملف/أمر محذوف ----------
    deleted_all = set(plan.deletes)
    removed_names: set[tuple[str, str]] = set()
    changed = True
    while changed:
        changed = False
        for pdir, d in pkgs.items():
            for k, v in list((d.get("scripts") or {}).items()):
                if (pdir, k) in removed_names:
                    continue
                files, runs = command_refs(v, pdir, names)
                if (files & deleted_all) or (runs & removed_names):
                    removed_names.add((pdir, k))
                    changed = True
    for pdir, k in sorted(removed_names):
        plan.pkg_removed.setdefault(pdir or ".", []).append(k)


# ---- الكود اليتيم ------------------------------------------------------------
def phase_dead_code(repo: Repo, g: Graph, plan: Plan, extra_dead: set[str]) -> dict:
    files = repo.files
    skip = set(plan.deletes) | extra_dead

    entries: set[str] = set()
    cand_files: set[str] = set()
    for rel in files:
        if rel in skip:
            continue
        proj = project_of(rel)
        if proj is None:
            # ما خارج المشاريع الثلاثة (workers, tools, packages, shared, tooling ...) نقاط دخول
            if is_code(rel) or rel.endswith((".json", ".css")):
                entries.add(rel)
            continue
        sub = rel[len(proj) + 1:]
        top = sub.split("/", 1)[0] if "/" in sub else ""
        in_cand_dir = top in CANDIDATE_DIRS.get(proj, [])
        if is_test(rel):
            continue  # تُعالج لاحقًا
        if in_cand_dir and is_code(rel) and not re.search(r"\.d\.[cm]?ts$", rel):
            # استثناءات Next الخاصة
            stem = stem_of(rel)
            if proj == "frontend" and sub.startswith("app/") and stem in NEXT_SPECIAL:
                entries.add(rel)
                continue
            if proj == "apps/api" and (
                sub.startswith("src/scripts/")
                or sub in {"src/server.ts", "src/appwrite-entry.ts", "src/instrument.ts"}
            ):
                entries.add(rel)
                continue
            cand_files.add(rel)
        else:
            entries.add(rel)   # إعدادات، app/ للموبايل، public، scripts، prisma ...
    # app/ في الموبايل = routes (Expo Router): كلها نقاط دخول، لا مرشحة
    entries |= {r for r in files if r.startswith("apps/mobile/app/") and r not in skip}

    tests = {r for r in files if is_test(r) and r not in skip and project_of(r)}
    non_cand_entries = entries - cand_files

    # الحي إنتاجيًا: من نقاط الدخول فقط (بدون الاختبارات)
    prod_entries = {e for e in non_cand_entries if not is_test(e)}
    prod_live = g.reach(prod_entries, skip=skip | tests)
    S = {c for c in cand_files if c not in prod_live}

    # اختبارات "ميتة": كل حوافّها المحلية داخل S (ولها حافة واحدة على الأقل داخل S)
    def local_edges(t: str) -> set[str]:
        return {e for e in g.all_edges(t) if e in files and e not in skip}

    shared_helpers = {r for r in files if re.search(r"(vitest|jest)\.setup|test-support/|__mocks__/|/helpers?/|setup\.", r)}
    dead_tests: set[str] = set()
    for t in tests:
        eds = {e for e in local_edges(t) if e not in shared_helpers and not is_test(e)}
        if eds and eds <= S:
            dead_tests.add(t)

    # ── تثبيت الحماية بتكرار حتى الاستقرار ─────────────────────────────────────
    # (1) مرجع من خارج الميتين (ملف حي أو اختبار حي)  (2) إشارة نصية في كود حي (بدون تعليقات)
    referrers: dict[str, set[str]] = defaultdict(set)
    for src in files:
        if src in skip:
            continue
        for t in g.all_edges(src):
            referrers[t].add(src)

    tok_re = re.compile(r"[A-Za-z0-9_$]+(?:-[A-Za-z0-9_$]+)*")
    corpus: dict[str, set[str]] = {}
    wanted = {stem_of(s) for s in S}
    for rel in files:
        if rel in skip or rel in S or is_test(rel):
            continue
        if not is_text(rel) or rel.endswith((".md", ".csv", ".sql")):
            continue
        if posixpath.basename(rel) in {"package-lock.json", "pnpm-lock.yaml"}:
            continue
        if rel.startswith("apps/mobile/scripts/") and rel.endswith(".json"):
            continue  # manifests تصف الملفات المعزولة، وليست استعمالًا
        toks = set(tok_re.findall(strip_comments(repo.text(rel), rel)))
        corpus[rel] = toks & wanted
    token_files: dict[str, set[str]] = defaultdict(set)
    for rel, toks in corpus.items():
        for tkn in toks:
            token_files[tkn].add(rel)

    def mention_refs(s: str) -> list[str]:
        stem = stem_of(s)
        if stem.lower() in GENERIC_STEMS or len(stem) < 5:
            return []
        return sorted(r for r in token_files.get(stem, ()) if r != s)

    live_S: set[str] = set()
    protected: set[str] = set()
    mention_protected: dict[str, list[str]] = {}
    final = set(S)
    dead_tests_final: set[str] = set()
    for _ in range(50):
        dead_tests_final = set()
        for t in dead_tests:
            eds = {e for e in local_edges(t) if e not in shared_helpers and not is_test(e)}
            if eds and eds <= final:
                dead_tests_final.add(t)
        changed = False
        for s_ in sorted(final):
            outside = {r for r in referrers.get(s_, ()) if r not in final and r not in dead_tests_final}
            if outside:
                live_S.add(s_)
                protected.add(s_)
                changed = True
                continue
            mr = mention_refs(s_)
            if mr:
                live_S.add(s_)
                mention_protected[s_] = mr[:5]
                changed = True
        final = S - live_S
        if not changed:
            break
    protected -= set(mention_protected)

    for s in sorted(final):
        plan.delete(s, "dead-code", "ملف غير قابل للوصول من أي نقطة دخول (لا استيراد ولا إشارة)")
    for t in sorted(dead_tests_final):
        plan.delete(t, "dead-code", "اختبار لا يغطي إلا ملفات ميتة")
        # snapshots
        for snap in (f"{posixpath.dirname(t)}/__snapshots__/{posixpath.basename(t)}.snap",):
            if snap in files:
                plan.delete(snap, "dead-code", "snapshot لاختبار محذوف")

    return {
        "candidates": len(cand_files),
        "prod_unreachable": len(S),
        "deleted_sources": len(final),
        "deleted_tests": len(dead_tests_final),
        "test_only_kept": sorted(protected)[:200],
        "mention_protected": mention_protected,
    }


# ---- الوثائق ------------------------------------------------------------------
def phase_docs(repo: Repo, plan: Plan, purge_archive: bool) -> None:
    files = repo.files
    deleted = set(plan.deletes)

    # corpus الإشارات للملفات الحية (غير وثائق)
    corpus_tokens: set[str] = set()
    tok = re.compile(r"[\w.\-]+")
    for rel in files:
        if rel in deleted or rel.endswith((".md", ".csv")) or not is_text(rel):
            continue
        if posixpath.basename(rel) in {"package-lock.json", "pnpm-lock.yaml"}:
            continue
        corpus_tokens |= set(tok.findall(repo.text(rel)))

    def mentioned(rel: str) -> bool:
        return posixpath.basename(rel) in corpus_tokens

    def route(rel: str, dst: str, cat: str) -> None:
        if rel in deleted or rel not in files:
            return
        if mentioned(rel):
            plan.notes.append(f"لم يُنقل {rel} لأن ملفًا حيًا يشير إليه بالاسم")
            return
        plan.move(rel, dst, cat)

    def archive_dst(rel: str, area: str, subdir: str = "") -> str:
        base = posixpath.basename(rel)
        return posixpath.join("docs/archive", area, subdir, base) if subdir else posixpath.join("docs/archive", area, base)

    # الجذر
    for src, dst in ROOT_DOC_MOVES.items():
        route(src, dst, "docs" if not dst.startswith("tools/") else "tools")
    # docs/ الحالية
    for src, dst in DOCS_DIR_MOVES.items():
        route(src, dst, "docs")
    for rel in sorted(files):
        if rel.startswith(DOCS_ARCHIVE_PREFIXES) and rel.count("/") == 1:
            route(rel, archive_dst(rel, "root"), "archive")

    # docs/mobile/archive → docs/archive/mobile/archive
    for rel in sorted(files):
        if rel.startswith("docs/mobile/archive/"):
            route(rel, posixpath.join("docs/archive/mobile/archive", rel[len("docs/mobile/archive/"):]), "archive")
        elif rel.startswith("apps/mobile/docs/history/"):
            route(rel, posixpath.join("docs/archive/mobile/history", rel[len("apps/mobile/docs/history/"):]), "archive")
        elif rel.startswith("apps/mobile/docs/") and rel.count("/") == 3 and rel.endswith(".md"):
            if HIST_RE.search(posixpath.basename(rel)):
                route(rel, archive_dst(rel, "mobile", "docs"), "archive")
        elif rel.startswith("apps/mobile/") and rel.count("/") == 2 and rel.endswith(".md") and posixpath.basename(rel) != "README.md":
            route(rel, f"apps/mobile/docs/{posixpath.basename(rel)}" if not HIST_RE.search(rel) else archive_dst(rel, "mobile", "docs"), "docs")
        elif rel.startswith("frontend/docs/") and rel.count("/") == 2:
            if HIST_RE.search(posixpath.basename(rel)):
                route(rel, archive_dst(rel, "web", "docs"), "archive")
        elif rel.startswith("frontend/") and rel.count("/") == 1 and rel.endswith(".md") and posixpath.basename(rel) != "README.md":
            route(rel, f"frontend/docs/{posixpath.basename(rel)}", "docs")
        elif rel.startswith("apps/api/") and rel.count("/") == 2 and rel.endswith(".md") and posixpath.basename(rel) not in {"README.md", "SECURITY.md"}:
            route(rel, archive_dst(rel, "api"), "archive")
        elif rel.startswith("apps/api/docs/") and rel.count("/") == 3 and rel.endswith((".md", ".csv")):
            if HIST_RE.search(posixpath.basename(rel)):
                route(rel, archive_dst(rel, "api", "docs"), "archive")
        elif rel.startswith("docs/performance/") and rel.count("/") == 2:
            if HIST_RE.search(posixpath.basename(rel)) or "CHANGELOG" in rel:
                route(rel, archive_dst(rel, "web", "performance"), "archive")

    # حل التصادم في الوجهات
    seen: dict[str, str] = {}
    for src in sorted(plan.moves):
        dst, cat = plan.moves[src]
        if dst in seen or (dst in files and dst != src and dst not in plan.moves):
            slug = re.sub(r"[^A-Za-z0-9]+", "-", posixpath.dirname(src)).strip("-")
            base, ext = posixpath.splitext(posixpath.basename(dst))
            dst = posixpath.join(posixpath.dirname(dst), f"{slug}__{base}{ext}")
            plan.moves[src] = (dst, cat)
        seen[dst] = src

    if purge_archive:
        for src in list(plan.moves):
            dst, cat = plan.moves[src]
            if cat == "archive":
                del plan.moves[src]
                plan.delete(src, "docs", "تقرير تاريخي (--purge-archive)")


def phase_tools(repo: Repo, plan: Plan) -> None:
    for rel in sorted(repo.files):
        if rel.startswith("tooling/") and rel not in plan.deletes:
            plan.move(rel, "tools/" + rel[len("tooling/"):], "tools")


# ──────────────────────────────────────────────────────────────────────────────
# تنفيذ
# ──────────────────────────────────────────────────────────────────────────────
def apply_plan(repo: Repo, plan: Plan, trash: Path | None) -> None:
    root = repo.root
    # 1) حذف / سلة
    for rel in sorted(plan.deletes):
        p = root / rel
        if not p.exists():
            continue
        if trash:
            dst = trash / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(p), str(dst))
        else:
            p.unlink()

    # 2) نقل
    for src in sorted(plan.moves):
        dst, _ = plan.moves[src]
        s, d = root / src, root / dst
        if not s.exists():
            continue
        d.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(s), str(d))


def rewrite_path_refs(root: Path, mapping: dict[str, str], skip_prefixes=("docs/archive/",)) -> int:
    """إعادة كتابة مراجع المسارات النصية (package.json, workflows, mjs, py ...) لمجلد/ملف منقول."""
    changed = 0
    items = sorted(mapping.items(), key=lambda kv: -len(kv[0]))
    for base, dirs, names in os.walk(root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for n in names:
            p = Path(base) / n
            rel = p.relative_to(root).as_posix()
            if not is_text(rel) or rel.endswith((".md", ".csv")):
                continue
            if posixpath.basename(rel) in {"package-lock.json", "pnpm-lock.yaml", "reorganize_cleanup.py"}:
                continue
            try:
                t = p.read_text(encoding="utf-8")
            except Exception:
                continue
            orig = t
            for old, new in items:
                t = re.sub(r"(?<![\w./@-])" + re.escape(old), new, t)
            if t != orig:
                p.write_text(t, encoding="utf-8")
                changed += 1
    return changed


def patch_package_json(root: Path, removed: dict[str, list[str]]) -> dict[str, int]:
    out = {}
    for pdir, names in removed.items():
        p = root / pdir / "package.json" if pdir != "." else root / "package.json"
        if not p.exists():
            continue
        raw = p.read_text(encoding="utf-8")
        try:
            d = json.loads(raw)
        except Exception:
            continue
        scripts = d.get("scripts") or {}
        n = 0
        for k in names:
            if k in scripts:
                del scripts[k]
                n += 1
        d["scripts"] = scripts
        trailing = "\n" if raw.endswith("\n") else ""
        p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + trailing, encoding="utf-8")
        out[str(p.relative_to(root))] = n
    return out


def patch_mobile_runner(root: Path) -> list[str]:
    msgs = []
    runner = root / "apps/mobile/scripts/run-all-verifications.mjs"
    if runner.exists():
        t = runner.read_text(encoding="utf-8")
        o = t
        # أزل كتلة legacy manifest و سطور الطباعة المرتبطة بها
        t = re.sub(r"\nlet legacyCount = 0;\ntry \{.*?\n\}\n(?=\nconsole\.log)", "\nconst legacyCount = 0;\n", t, flags=re.S)
        t = re.sub(r"console\.log\(`Quarantined historical checks[^\n]*\n", "", t)
        t = t.replace("const legacyCount = 0;\n", "")
        t = t.replace("  |  Quarantined historical (not passed): ${legacyCount}", "")
        if t != o:
            runner.write_text(t, encoding="utf-8")
            msgs.append("run-all-verifications.mjs: أُزيل الاعتماد على legacy-verifications/manifest.json")
    qa = root / "apps/mobile/scripts/quarantined-active.json"
    if qa.exists():
        # كل المعزولات حُذفت → أفرغ المانيفست
        try:
            d = json.loads(qa.read_text(encoding="utf-8"))
            existing = [e for e in d.get("entries", []) if (root / "apps/mobile/scripts" / e.get("file", "")).exists()]
            d["entries"] = existing
            d["count"] = len(existing)
            qa.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            msgs.append(f"quarantined-active.json: متبقٍ {len(existing)} إدخال")
        except Exception:
            pass
    return msgs


LINK_RE = re.compile(r"(\]\()([^)\s#]+)((?:#[^)\s]*)?)(\))")


def fix_md_links(root: Path, old_files: set[str], moved: dict[str, str]) -> int:
    """يعيد حساب الروابط النسبية في md بعد النقل/الحذف الجزئي."""
    new_to_old = {v: k for k, v in moved.items()}
    fixed = 0
    for base, dirs, names in os.walk(root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for n in names:
            if not n.endswith(".md"):
                continue
            p = Path(base) / n
            new_rel = p.relative_to(root).as_posix()
            old_rel = new_to_old.get(new_rel, new_rel)
            try:
                t = p.read_text(encoding="utf-8")
            except Exception:
                continue

            def sub(m: re.Match) -> str:
                nonlocal fixed
                link = m.group(2)
                if re.match(r"^[a-z][a-z0-9+.-]*:|^/|^#", link, re.I):
                    return m.group(0)
                tgt_old = posixpath.normpath(posixpath.join(posixpath.dirname(old_rel), link))
                if tgt_old not in old_files and not any(f.startswith(tgt_old + "/") for f in list(old_files)[:0]):
                    return m.group(0)
                tgt_new = moved.get(tgt_old, tgt_old)
                new_link = posixpath.relpath(tgt_new, posixpath.dirname(new_rel))
                if new_link != link:
                    fixed += 1
                    return f"{m.group(1)}{new_link}{m.group(3)}{m.group(4)}"
                return m.group(0)

            t2 = LINK_RE.sub(sub, t)
            if t2 != t:
                p.write_text(t2, encoding="utf-8")
    return fixed


def remove_empty_dirs(root: Path) -> list[str]:
    removed = []
    for base, dirs, names in os.walk(root, topdown=False):
        rel = Path(base).relative_to(root).as_posix()
        if rel == "." or any(part in SKIP_DIRS or part == ".git" for part in rel.split("/")):
            continue
        try:
            if not any(Path(base).iterdir()):
                Path(base).rmdir()
                removed.append(rel)
        except OSError:
            pass
    return removed


# ──────────────────────────────────────────────────────────────────────────────
# التقرير
# ──────────────────────────────────────────────────────────────────────────────
def write_report(root: Path, repo: Repo, plan: Plan, stats: dict, applied: bool, extra: dict) -> Path:
    out_dir = root / "docs" if applied else root
    out_dir.mkdir(parents=True, exist_ok=True)
    cats = defaultdict(list)
    for rel, (cat, why) in plan.deletes.items():
        cats[cat].append((rel, why))
    mv = defaultdict(list)
    for s, (d, cat) in plan.moves.items():
        mv[cat].append((s, d))
    size = lambda items: sum(repo.files.get(r, 0) for r, _ in items)

    name = "CLEANUP_REPORT.md"
    path = out_dir / name
    L = []
    L.append("# تقرير إعادة التنظيم والتنظيف\n")
    L.append(f"- الوضع: **{'تم التنفيذ' if applied else 'DRY-RUN (لم يُغيَّر شيء)'}**")
    L.append(f"- التاريخ: {_dt.datetime.now().isoformat(timespec='seconds')}\n")
    L.append("## الملخص\n")
    L.append("| الفئة | عدد المحذوف | الحجم |")
    L.append("|---|---:|---:|")
    for cat in ("junk", "scripts", "dead-code", "docs"):
        if cat in cats:
            L.append(f"| {cat} | {len(cats[cat])} | {human(size(cats[cat]))} |")
    L.append(f"| **المجموع** | **{len(plan.deletes)}** | **{human(sum(repo.files.get(r, 0) for r in plan.deletes))}** |")
    L.append("")
    L.append(f"- ملفات منقولة: **{len(plan.moves)}**")
    for cat, items in mv.items():
        L.append(f"  - {cat}: {len(items)}")
    if stats:
        L.append("\n## تحليل الكود اليتيم\n")
        L.append(f"- ملفات مرشحة للفحص: {stats['candidates']}")
        L.append(f"- غير قابلة للوصول إنتاجيًا: {stats['prod_unreachable']}")
        L.append(f"- حُذف منها: {stats['deleted_sources']} ملف مصدر + {stats['deleted_tests']} اختبار")
        L.append(f"- محمية لأنها تُستعمل من اختبارات حية (test-only): {len(stats['test_only_kept'])}")
        L.append(f"- محمية بإشارة نصية في ملف حي: {len(stats['mention_protected'])}")
    if plan.pkg_removed:
        L.append("\n## سكربتات npm المزالة (كانت تشير لملفات محذوفة)\n")
        for pdir, ks in plan.pkg_removed.items():
            L.append(f"- `{pdir}/package.json`: {len(ks)} سكربت")
    if extra:
        L.append("\n## إجراءات إضافية\n")
        for k, v in extra.items():
            L.append(f"- {k}: {v}")
    if plan.notes:
        L.append("\n## ملاحظات\n")
        for n in plan.notes:
            L.append(f"- {n}")
    L.append("\n## ما لم يُفعل عمدًا\n")
    L.append("- نقل `frontend/` إلى `apps/web`: إعدادات النشر خارج المستودع (Cloudflare Pages/Docker/CI) تشير إلى `frontend`.")
    L.append("- إعادة ترتيب مجلدات الكود الداخلية: تحتاج `tsc`/اختبارات للتحقق بعد كل نقل.")
    L.append("- لم تُحذف ملفات الاختبار الحية ولا أي ملف تستعمله اختبارات حية.")
    L.append("\n## قائمة المحذوف\n")
    for cat, items in cats.items():
        L.append(f"\n### {cat} ({len(items)})\n")
        for rel, why in sorted(items):
            L.append(f"- `{rel}` — {why}")
    L.append("\n## قائمة المنقول\n")
    for cat, items in mv.items():
        L.append(f"\n### {cat} ({len(items)})\n")
        for s, d in sorted(items):
            L.append(f"- `{s}` → `{d}`")
    if stats and stats["mention_protected"]:
        L.append("\n## ملفات يتيمة بالرسم لكن محميّة بإشارة نصية (راجعها يدويًا)\n")
        for s, refs in sorted(stats["mention_protected"].items()):
            L.append(f"- `{s}` ← مذكور في: " + ", ".join(f"`{r}`" for r in refs))
    if stats and stats["test_only_kept"]:
        L.append("\n## ملفات تستعملها الاختبارات فقط (لم تُحذف)\n")
        for s in stats["test_only_kept"]:
            L.append(f"- `{s}`")
    path.write_text("\n".join(L) + "\n", encoding="utf-8")
    (out_dir / "CLEANUP_REPORT.json").write_text(
        json.dumps(
            {
                "applied": applied,
                "deletes": {k: {"category": c, "reason": w} for k, (c, w) in sorted(plan.deletes.items())},
                "moves": {k: {"to": d, "category": c} for k, (d, c) in sorted(plan.moves.items())},
                "pkg_removed": plan.pkg_removed,
                "stats": {k: v for k, v in stats.items() if k not in ("test_only_kept", "mention_protected")},
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return path


# ──────────────────────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description="MarketPlat reorganize & cleanup")
    ap.add_argument("--root", default=".", help="جذر المشروع (الافتراضي: المجلد الحالي)")
    ap.add_argument("--apply", action="store_true", help="تنفيذ فعلي (الافتراضي dry-run)")
    ap.add_argument("--no-trash", action="store_true", help="حذف نهائي بدل نقل للسلة")
    ap.add_argument("--skip-junk", action="store_true")
    ap.add_argument("--skip-scripts", action="store_true")
    ap.add_argument("--skip-code", action="store_true")
    ap.add_argument("--skip-docs", action="store_true")
    ap.add_argument("--skip-tools", action="store_true")
    ap.add_argument("--purge-archive", action="store_true", help="احذف التقارير التاريخية بدل نقلها إلى docs/archive")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    if not (root / "apps" / "api").is_dir() or not (root / "frontend").is_dir():
        log("✗ هذا لا يبدو جذر MarketPlat (يلزم apps/api و frontend). شغّل السكربت من الجذر.")
        return 2

    log(f"▶ الجذر: {root}")
    log(f"▶ الوضع: {'APPLY' if args.apply else 'DRY-RUN'}")
    repo = Repo(root)
    log(f"▶ ملفات ممسوحة: {len(repo.files)}")
    plan = Plan()

    if not args.skip_junk:
        phase_junk(repo, plan)
    g = Graph(repo)
    g.build()
    if not args.skip_scripts:
        phase_scripts(repo, g, plan)
    stats: dict = {}
    if not args.skip_code:
        # تكرار: حذف ملف يتيم قد يجعل ملفًا آخر يتيمًا (تسلسل)
        for i in range(8):
            before = len(plan.deletes)
            st = phase_dead_code(repo, g, plan, set())
            if i == 0:
                stats = st
            else:
                stats["deleted_sources"] += st["deleted_sources"]
                stats["deleted_tests"] += st["deleted_tests"]
                stats["test_only_kept"] = st["test_only_kept"]
                stats["mention_protected"] = st["mention_protected"]
                stats["prod_unreachable"] = max(stats["prod_unreachable"], st["prod_unreachable"])
            if len(plan.deletes) == before:
                break
    if not args.skip_docs:
        phase_docs(repo, plan, args.purge_archive)
    if not args.skip_tools:
        phase_tools(repo, plan)

    by = defaultdict(int)
    for _, (c, _) in plan.deletes.items():
        by[c] += 1
    log("\n── الخطة ──")
    for c, n in sorted(by.items()):
        log(f"  حذف [{c}]: {n}")
    log(f"  نقل: {len(plan.moves)}")
    log(f"  إزالة سكربتات npm: {sum(len(v) for v in plan.pkg_removed.values())}")

    extra: dict = {}
    if not args.apply:
        rp = write_report(root, repo, plan, stats, False, extra)
        log(f"\n✓ DRY-RUN انتهى. التقرير: {rp.relative_to(root)}")
        log("  راجعه ثم شغّل مع --apply")
        return 0

    old_files = set(repo.files)
    trash = None
    if not args.no_trash:
        stamp = _dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        trash = root.parent / f"{root.name}.cleanup-trash" / stamp
        trash.mkdir(parents=True, exist_ok=True)
        log(f"  سلة المحذوفات: {trash}")

    apply_plan(repo, plan, trash)
    moved = {s: d for s, (d, _) in plan.moves.items()}

    # مراجع المسارات النصية للأدوات المنقولة
    path_map = {s: d for s, d in moved.items() if s.startswith("tooling/") or s.endswith(".py")}
    path_map["tooling/"] = "tools/"
    n_rw = rewrite_path_refs(root, path_map)
    extra["إعادة كتابة مراجع مسارات (tooling→tools …)"] = f"{n_rw} ملف"

    pk = patch_package_json(root, plan.pkg_removed)
    if pk:
        extra["package.json (إزالة سكربتات)"] = ", ".join(f"{k}: {v}" for k, v in pk.items())
    for m in patch_mobile_runner(root):
        extra[m.split(":")[0]] = m

    fixed = fix_md_links(root, old_files, moved)
    extra["روابط md المُصلَحة"] = str(fixed)
    removed_dirs = remove_empty_dirs(root)
    extra["مجلدات فارغة محذوفة"] = f"{len(removed_dirs)}"

    rp = write_report(root, repo, plan, stats, True, extra)
    log(f"\n✓ تم. التقرير: {rp.relative_to(root)}")
    if trash:
        log(f"  للتراجع: انسخ الملفات من {trash} إلى أماكنها (نفس المسارات النسبية).")
    log("  بعد التنفيذ شغّل: pnpm install && pnpm run type-check:all && pnpm run test:all")
    return 0


if __name__ == "__main__":
    sys.exit(main())
