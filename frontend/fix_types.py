#!/usr/bin/env python3
"""
Fix the 5 TS2532/TS2538 errors in ForYouMixedSection.tsx
by rewriting the queue-drain block using line numbers.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FOR_YOU = ROOT / "components/home/ForYouMixedSection.tsx"


def backup(path: Path) -> None:
    bak = path.with_suffix(path.suffix + ".bak")
    if not bak.exists():
        bak.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"  backup -> {bak.name}")


def fix_for_you() -> bool:
    if not FOR_YOU.exists():
        print(f"!! not found: {FOR_YOU}")
        return False

    lines = FOR_YOU.read_text(encoding="utf-8").splitlines(keepends=True)

    # Find the line:  if (idx[q] < queues[q].length) {
    start = None
    for i, ln in enumerate(lines):
        if re.search(r"idx\[\w+\]\s*<\s*queues\[\w+\]\.length", ln):
            start = i
            break

    if start is None:
        print("!! could not locate the 'if (idx[...] < queues[...].length)' line")
        return False

    # Detect loop variable name (q, k, key, ...)
    m = re.search(r"idx\[(\w+)\]", lines[start])
    var = m.group(1)
    indent = re.match(r"(\s*)", lines[start]).group(1)
    print(f"  found block at line {start + 1}, loop var = '{var}', indent = {len(indent)}")

    # Find the closing brace of this if-block by brace counting
    depth = 0
    end = None
    for j in range(start, len(lines)):
        depth += lines[j].count("{") - lines[j].count("}")
        if depth == 0 and j > start:
            end = j
            break

    if end is None:
        print("!! could not find the closing brace of the block")
        return False

    inner = indent + "  "
    replacement = (
        f"{indent}const queue = queues[{var}];\n"
        f"{indent}if (!queue) continue;\n"
        f"{inner}const i = idx[{var}] ?? 0;\n"
        f"{inner}const item = queue[i];\n"
        f"{inner}if (item !== undefined) {{\n"
        f"{inner}  out.push(item);\n"
        f"{inner}  idx[{var}] = i + 1;\n"
        f"{inner}}}\n"
    )

    print(f"  replacing lines {start + 1}..{end + 1}")
    new_lines = lines[:start] + [replacement] + lines[end + 1:]
    backup(FOR_YOU)
    FOR_YOU.write_text("".join(new_lines), encoding="utf-8")
    print("OK ForYouMixedSection.tsx patched")
    return True


def main() -> int:
    print("Patching ForYouMixedSection.tsx...\n")
    ok = fix_for_you()
    print()
    if ok:
        print("Done. Run:  npm run type-check")
        return 0
    print("Failed. Paste lines 40-60 of the file and I'll fix it manually.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
