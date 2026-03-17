#!/usr/bin/env python3
"""
review.py — Pre-analysis script for Rust in Action reviews.
Usage: python review.py <file.rs>

Scans a Rust source file for systems-programming anti-patterns from the book:
endianness issues, unsafe shared state, missing buffered I/O, unwrap misuse,
unbounded thread spawning, and incorrect smart pointer choices.
"""

import re
import sys
from pathlib import Path


CHECKS = [
    (
        r"from_ne_bytes|to_ne_bytes",
        "Ch 5/7: Native endianness",
        "use from_le_bytes/to_le_bytes or from_be_bytes/to_be_bytes to match the protocol spec",
    ),
    (
        r"static\s+mut\s+\w+",
        "Ch 6/10: static mut",
        "data race risk — replace with Arc<Mutex<T>> or std::sync::atomic",
    ),
    (
        r"\.unwrap\(\)",
        "Ch 3: .unwrap()",
        "panics on failure — use ?, .expect(\"reason\"), or match in production paths",
    ),
    (
        r"unsafe\s*\{",
        "Ch 6: unsafe block",
        "ensure a safe abstraction wraps this; add a // SAFETY: comment explaining invariants",
    ),
    (
        r"File::open|File::create",
        "Ch 7: Unbuffered file I/O",
        "wrap in BufReader::new()/BufWriter::new() to batch syscalls",
    ),
    (
        r"thread::spawn",
        "Ch 10: thread::spawn",
        "if inside a loop, consider a thread pool (channel + Arc<Mutex<Receiver>>) instead of one thread per task",
    ),
    (
        r"\bRc\s*::\s*(new|clone)\b",
        "Ch 6: Rc usage",
        "Rc is not Send — if shared across threads, replace with Arc",
    ),
    (
        r"Box::new\(Vec\b|Box::new\(vec!",
        "Ch 6: Box<Vec<T>>",
        "Vec already heap-allocates — Box<Vec<T>> is double-indirection with no benefit; return Vec directly",
    ),
    (
        r"\bexpect\s*\(\s*\)",
        "Ch 3: .expect() with empty string",
        "add a meaningful reason: .expect(\"what invariant was violated\")",
    ),
]


def scan(source: str) -> list[dict]:
    findings = []
    lines = source.splitlines()
    for lineno, line in enumerate(lines, start=1):
        stripped = line.strip()
        if stripped.startswith("//"):
            continue  # skip comments
        for pattern, label, advice in CHECKS:
            if re.search(pattern, line):
                findings.append({
                    "line": lineno,
                    "text": line.rstrip(),
                    "label": label,
                    "advice": advice,
                })
    return findings


def group_by_label(findings: list[dict]) -> dict:
    groups: dict[str, list] = {}
    for f in findings:
        groups.setdefault(f["label"], []).append(f)
    return groups


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
    groups = group_by_label(findings)

    print(sep("="))
    print("RUST IN ACTION — PRE-REVIEW REPORT")
    print(sep("="))
    print(f"File   : {path}")
    print(f"Lines  : {len(source.splitlines())}")
    print(f"Issues : {len(findings)} potential anti-patterns across {len(groups)} categories")
    print()

    if not findings:
        print("  [OK] No common anti-patterns detected.")
        print()
    else:
        for label, items in groups.items():
            print(sep())
            print(f"  {label}  ({len(items)} occurrence{'s' if len(items) != 1 else ''})")
            print(sep())
            print(f"  Advice: {items[0]['advice']}")
            print()
            for item in items[:5]:  # cap display at 5 per category
                print(f"  line {item['line']:>4}:  {item['text'][:100]}")
            if len(items) > 5:
                print(f"  ... and {len(items) - 5} more occurrence(s)")
            print()

    severity = (
        "HIGH" if len(findings) >= 5
        else "MEDIUM" if len(findings) >= 2
        else "LOW" if findings
        else "NONE"
    )
    print(sep("="))
    print(f"SEVERITY: {severity}  |  Review chapters: Ch 3 (errors), Ch 5-7 (data/files), Ch 6 (pointers), Ch 10 (concurrency)")
    print(sep("="))


if __name__ == "__main__":
    main()
