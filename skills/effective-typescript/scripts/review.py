#!/usr/bin/env python3
"""
review.py — Pre-analysis script for Effective TypeScript reviews.
Usage: python review.py <file.ts|file.tsx>

Scans a TypeScript source file for anti-patterns from the book's 62 items:
any usage, type assertions, object wrapper types, non-null assertions,
missing strict mode, interface-of-unions, plain string types, and more.
"""

import re
import sys
from pathlib import Path


CHECKS = [
    (
        r":\s*any\b",
        "Item 5/38: any type annotation",
        "replace with a specific type, generic parameter, or unknown for truly unknown values",
    ),
    (
        r"\bas\s+any\b",
        "Item 38/40: 'as any' assertion",
        "scope 'as any' as narrowly as possible — hide inside a well-typed wrapper function; prefer 'as unknown as T' for safer double assertion",
    ),
    (
        r"\bString\b|\bNumber\b|\bBoolean\b|\bObject\b|\bSymbol\b",
        "Item 10: Object wrapper type (String/Number/Boolean)",
        "use primitive types: string, number, boolean — never the wrapper class types",
    ),
    (
        r"!\.",
        "Item 28/31: Non-null assertion (!).",
        "non-null assertions are usually a symptom of an imprecise type — fix the type instead; consider optional chaining (?.) or a type guard",
    ),
    (
        r"@ts-ignore|@ts-nocheck",
        "Item 38: @ts-ignore suppresses type errors",
        "fix the underlying type issue; if unavoidable use @ts-expect-error with a comment explaining why",
    ),
    (
        r"function\s+\w+[^{]*\{[^}]{0,20}\}",
        None,  # skip — too noisy
        None,
    ),
    (
        r"interface\s+\w+\s*\{[^}]*\?[^}]*\?[^}]*\}",
        "Item 32: Interface with multiple optional fields",
        "multiple optional fields that have implicit relationships suggest an interface-of-unions — convert to a tagged discriminated union",
    ),
    (
        r"param(?:eter)?\s*:\s*string(?!\s*[|&])",
        "Item 33: Plain string parameter",
        "consider a string literal union if the parameter has a finite set of valid values (e.g. 'asc' | 'desc')",
    ),
    (
        r"\.json\(\)\s*as\s+\w",
        "Item 9/40: Direct type assertion on .json()",
        "assign to unknown first, then narrow: 'const raw: unknown = await res.json()' — assertion inside a well-typed wrapper is acceptable (Item 40)",
    ),
    (
        r"Promise<any>",
        "Item 38: Promise<any> return type",
        "replace with Promise<unknown> or a concrete type — Promise<any> disables type checking on the resolved value",
    ),
]


def scan(source: str) -> list[dict]:
    findings = []
    lines = source.splitlines()
    for lineno, line in enumerate(lines, start=1):
        stripped = line.strip()
        if stripped.startswith("//") or stripped.startswith("*"):
            continue
        for pattern, label, advice in CHECKS:
            if label is None:
                continue
            if re.search(pattern, line):
                findings.append({
                    "line": lineno,
                    "text": line.rstrip(),
                    "label": label,
                    "advice": advice,
                })
    return findings


def check_strict(source: str) -> bool:
    """Returns True if this looks like a tsconfig with strict mode enabled."""
    return bool(re.search(r'"strict"\s*:\s*true', source))


def sep(char="-", width=70) -> str:
    return char * width


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python review.py <file.ts|file.tsx>")
        sys.exit(1)

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"Error: file not found: {path}")
        sys.exit(1)

    if path.suffix.lower() not in (".ts", ".tsx", ".json"):
        print(f"Warning: expected .ts/.tsx, got '{path.suffix}' — continuing anyway")

    source = path.read_text(encoding="utf-8", errors="replace")

    # Special case: tsconfig.json
    if path.name == "tsconfig.json":
        print(sep("="))
        print("EFFECTIVE TYPESCRIPT — TSCONFIG CHECK")
        print(sep("="))
        if check_strict(source):
            print("  [OK] strict: true is enabled (Item 2)")
        else:
            print("  [!] strict: true is NOT enabled — Item 2: always enable strict mode")
            print("       Add: \"strict\": true to compilerOptions")
        print()
        print(sep("="))
        return

    findings = scan(source)
    groups: dict[str, list] = {}
    for f in findings:
        groups.setdefault(f["label"], []).append(f)

    print(sep("="))
    print("EFFECTIVE TYPESCRIPT — PRE-REVIEW REPORT")
    print(sep("="))
    print(f"File   : {path}")
    print(f"Lines  : {len(source.splitlines())}")
    print(f"Issues : {len(findings)} potential violations across {len(groups)} categories")
    print()

    if not findings:
        print("  [OK] No common Effective TypeScript anti-patterns detected.")
        print()
    else:
        for label, items in groups.items():
            print(sep())
            print(f"  {label}  ({len(items)} occurrence{'s' if len(items) != 1 else ''})")
            print(sep())
            print(f"  Advice: {items[0]['advice']}")
            print()
            for item in items[:5]:
                print(f"  line {item['line']:>4}:  {item['text'][:100]}")
            if len(items) > 5:
                print(f"  ... and {len(items) - 5} more")
            print()

    severity = (
        "HIGH" if len(findings) >= 5
        else "MEDIUM" if len(findings) >= 2
        else "LOW" if findings
        else "NONE"
    )
    print(sep("="))
    print(f"SEVERITY: {severity}  |  Key items: Item 2 (strict), Item 5/38 (any/unknown), Item 9 (assertions), Item 28/32 (tagged unions), Item 33 (literal types)")
    print(sep("="))


if __name__ == "__main__":
    main()
