#!/usr/bin/env python3
"""
review.py — Pre-analysis script for Programming with Rust reviews.
Usage: python review.py <file.rs>

Scans a Rust source file for anti-patterns from the book:
unwrap misuse, unnecessary cloning, unsafe shared state, manual index loops,
missing Result return types, static mut, and more.
"""

import re
import sys
from pathlib import Path


CHECKS = [
    (
        r"\.unwrap\(\)",
        "Ch 12: .unwrap()",
        "panics on failure in production paths — use ?, .expect(\"reason\"), or match",
    ),
    (
        r"\.clone\(\)",
        "Ch 8: .clone()",
        "verify cloning is necessary — prefer borrowing (&T or &mut T) to avoid heap allocation",
    ),
    (
        r"static\s+mut\s+\w+",
        "Ch 19: static mut",
        "data race risk — replace with Arc<Mutex<T>> or std::sync::atomic types",
    ),
    (
        r"unsafe\s*\{",
        "Ch 20: unsafe block",
        "minimize unsafe scope; add a // SAFETY: comment explaining the invariant being upheld",
    ),
    (
        r"for\s+\w+\s+in\s+0\s*\.\.\s*\w+\.len\(\)",
        "Ch 6: Manual index loop",
        "use iterator adapters: for item in &collection, or .iter().enumerate() if index is needed",
    ),
    (
        r"\bpanic!\s*\(",
        "Ch 12: panic!()",
        "panics should be reserved for unrecoverable programmer errors — use Result<T, E> for recoverable failures",
    ),
    (
        r"Box<dyn\s+\w+>",
        "Ch 17: dyn Trait (dynamic dispatch)",
        "prefer impl Trait for static dispatch (zero-cost) unless you need a heterogeneous collection",
    ),
    (
        r"Rc\s*::\s*(new|clone)\b",
        "Ch 19: Rc usage",
        "Rc is not Send — if shared across threads, use Arc instead",
    ),
    (
        r"\.expect\s*\(\s*\)",
        "Ch 12: .expect() with empty string",
        "add a meaningful reason: .expect(\"invariant: config is always loaded before this point\")",
    ),
]


def scan(source: str) -> list[dict]:
    findings = []
    lines = source.splitlines()
    for lineno, line in enumerate(lines, start=1):
        stripped = line.strip()
        if stripped.startswith("//"):
            continue
        for pattern, label, advice in CHECKS:
            if re.search(pattern, line):
                findings.append({
                    "line": lineno,
                    "text": line.rstrip(),
                    "label": label,
                    "advice": advice,
                })
    return findings


def sep(char="-", width=70) -> str:
    return char * width


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python review.py <file.rs>")
        sys.exit(1)

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"Error: file not found: {path}")
        sys.exit(1)

    if path.suffix.lower() != ".rs":
        print(f"Warning: expected a .rs file, got '{path.suffix}' — continuing anyway")

    source = path.read_text(encoding="utf-8", errors="replace")
    findings = scan(source)
    groups: dict[str, list] = {}
    for f in findings:
        groups.setdefault(f["label"], []).append(f)

    print(sep("="))
    print("PROGRAMMING WITH RUST — PRE-REVIEW REPORT")
    print(sep("="))
    print(f"File   : {path}")
    print(f"Lines  : {len(source.splitlines())}")
    print(f"Issues : {len(findings)} potential anti-patterns across {len(groups)} categories")
    print()

    if not findings:
        print("  [OK] No common Rust anti-patterns detected.")
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
    print(f"SEVERITY: {severity}  |  Key chapters: Ch 8 (ownership), Ch 12 (errors), Ch 17 (traits), Ch 19 (concurrency), Ch 20 (memory)")
    print(sep("="))


if __name__ == "__main__":
    main()
