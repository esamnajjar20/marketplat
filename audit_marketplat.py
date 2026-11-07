#!/usr/bin/env python3
import os
import re
import json
import subprocess
from pathlib import Path
from datetime import datetime

ROOT = Path.cwd()

IGNORE = {
    "node_modules", ".git", ".next", "dist", "build",
    ".wrangler", "coverage", ".turbo", "__pycache__"
}

TARGETS = {
    "next_config": ["next.config.ts", "next.config.js", "next.config.mjs"],
    "image_loader": ["imageLoader.ts", "imageLoader.js"],
    "gateway": ["worker.ts"],
    "server_api_fetch": ["serverApiFetch.ts"],
}

def run_git(args):
    try:
        p = subprocess.run(
            ["git", *args],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=20
        )
        return p.stdout.strip()
    except Exception as e:
        return f"GIT_ERROR: {e}"

def files():
    result = []
    for base, dirs, names in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in IGNORE]
        for name in names:
            p = Path(base) / name
            if p.suffix in {".ts", ".tsx", ".js", ".jsx", ".json", ".mjs"}:
                result.append(p)
    return result

ALL_FILES = files()

def find_named(names):
    return [
        p for p in ALL_FILES
        if p.name in names
    ]

def read_file(path):
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""

def matches(content, pattern):
    return [
        (i, line.strip()[:250])
        for i, line in enumerate(content.splitlines(), 1)
        if re.search(pattern, line, re.I)
    ]

report = {
    "generated_at": datetime.now().isoformat(),
    "root": str(ROOT),
    "git": {},
    "checks": {},
}

# Git state
report["git"] = {
    "branch": run_git(["branch", "--show-current"]),
    "status": run_git(["status", "--short"]),
    "diff_stat": run_git(["diff", "--stat"]),
    "diff_check": run_git(["diff", "--check"]),
    "changed_files": run_git(["diff", "--name-only"]).splitlines(),
}

# 1. Next image loader
next_files = find_named(TARGETS["next_config"])
loader_files = find_named(TARGETS["image_loader"])

next_results = []
for p in next_files:
    content = read_file(p)
    next_results.append({
        "file": str(p.relative_to(ROOT)),
        "loader_custom": bool(re.search(r"loader\s*:\s*['\"]custom['\"]", content)),
        "loader_file": bool(re.search(r"loaderFile\s*:", content)),
        "image_config_lines": matches(content, r"images\s*:|loader\s*:|loaderFile\s*:"),
    })

report["checks"]["image_loader"] = {
    "next_configs": next_results,
    "loader_files": [str(p.relative_to(ROOT)) for p in loader_files],
}

# 2. Gateway cache and concurrency
gateway_files = [
    p for p in ALL_FILES
    if p.name == "worker.ts"
    and ("cf-api-proxy" in str(p).lower() or "gateway" in str(p).lower())
]

gateway_results = []
for p in gateway_files:
    content = read_file(p)
    gateway_results.append({
        "file": str(p.relative_to(ROOT)),
        "cache_and_concurrency": matches(
            content,
            r"singleFlight|inFlight|forceReload|force.reload|registry|snapshot|cache|finally"
        ),
        "possible_cache_writes": matches(
            content,
            r"cache\.put|\.set\(|registryCache|snapshotCache"
        ),
    })

report["checks"]["gateway"] = gateway_results

# 3. Prefetch distribution
prefetch_files = []
prefetch_total = 0
for p in ALL_FILES:
    if p.suffix not in {".tsx", ".jsx"}:
        continue
    content = read_file(p)
    count = len(re.findall(r"prefetch\s*=\s*\{\s*false\s*\}", content))
    if count:
        prefetch_total += count
        prefetch_files.append({
            "file": str(p.relative_to(ROOT)),
            "count": count,
        })

report["checks"]["prefetch"] = {
    "total_disabled": prefetch_total,
    "files": sorted(prefetch_files, key=lambda x: x["count"], reverse=True),
}

# 4. Sales reports queries
sales_files = [
    p for p in ALL_FILES
    if "sales" in p.name.lower() or "report" in p.name.lower()
]

sales_results = []
for p in sales_files:
    content = read_file(p)
    found = matches(
        content,
        r"findMany|count\s*\(|aggregate|groupBy|queryRaw|RepeatableRead|soldAt|paymentStatus|sellerId|storeId"
    )
    if found:
        sales_results.append({
            "file": str(p.relative_to(ROOT)),
            "matches": found,
        })

report["checks"]["sales"] = sales_results

# 5. Analytics and presence timing
timing_files = [
    p for p in ALL_FILES
    if any(k in str(p).lower() for k in ["analytics", "presence", "web-vital"])
]

timing_results = []
for p in timing_files:
    content = read_file(p)
    found = matches(
        content,
        r"setInterval|setTimeout|flush|heartbeat|presence|staleTime|"
        r"120000|120_000|200000|200_000|30000|30_000|60000|60_000"
    )
    if found:
        timing_results.append({
            "file": str(p.relative_to(ROOT)),
            "matches": found,
        })

report["checks"]["analytics_presence"] = timing_results

# 6. Server API JSON error logging
api_fetch_files = [
    p for p in ALL_FILES
    if p.name == "serverApiFetch.ts"
]

api_fetch_results = []
for p in api_fetch_files:
    content = read_file(p)
    api_fetch_results.append({
        "file": str(p.relative_to(ROOT)),
        "diagnostic_lines": matches(
            content,
            r"Invalid JSON|content-type|content-length|CF-Ray|"
            r"response\.text|console\.(error|warn)|logger"
        ),
    })

report["checks"]["server_api_fetch"] = api_fetch_results

# 7. Project scripts
package_files = [
    p for p in ALL_FILES
    if p.name == "package.json"
]

scripts = {}
for p in package_files:
    try:
        data = json.loads(read_file(p))
        scripts[str(p.relative_to(ROOT))] = data.get("scripts", {})
    except Exception:
        pass

report["checks"]["package_scripts"] = scripts

# Save report
out_json = ROOT / "marketplat-audit.json"
out_txt = ROOT / "marketplat-audit.txt"

out_json.write_text(
    json.dumps(report, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

lines = []
lines.append("MARKETPLAT CODE AUDIT")
lines.append("=" * 60)
lines.append(f"Root: {ROOT}")
lines.append(f"Branch: {report['git']['branch']}")
lines.append("\nGIT STATUS\n" + report["git"]["status"])
lines.append("\nDIFF STAT\n" + report["git"]["diff_stat"])
lines.append("\nDIFF CHECK\n" + report["git"]["diff_check"])
lines.append("\nCHANGED FILES\n" + "\n".join(report["git"]["changed_files"]))

for section, data in report["checks"].items():
    lines.append(f"\n\n{'=' * 60}\n{section.upper()}\n{'=' * 60}")
    lines.append(json.dumps(data, ensure_ascii=False, indent=2))

out_txt.write_text("\n".join(lines), encoding="utf-8")

print("Audit completed. No source files were modified.")
print(f"JSON report: {out_json}")
print(f"Text report: {out_txt}")
print(f"Scanned source files: {len(ALL_FILES)}")
print(f"Disabled prefetch occurrences: {prefetch_total}")
print(f"Changed Git files: {len(report['git']['changed_files'])}")
