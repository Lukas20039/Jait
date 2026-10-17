#!/usr/bin/env python3
"""Join generated Rust translation cases with the saved coverage inventory.

This is an inventory/join step only. It reports which translated declarations
exist, which are still pending, and what matcher rules each Rust case asserts.
It produces no parity claim on its own.
"""

import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
CASES = os.path.join(ROOT, "tests", "contract", "tests", "tail_static.rs")
MANIFEST = os.path.join(ROOT, "tests", "contract", "coverage.json")
OUT = os.path.join(ROOT, ".jait", "artifacts", "parity-review", "index.json")

CASE_RE = re.compile(
    r"// (?P<original>[^\n]+): (?P<name>[^\n]*)\n"
    r"(?P<attrs>(?:#\[[^\]]*\]\n)*)"
    r"fn (?P<fn>tailstatic_[a-z0-9_]+)\(\) \{\n"
    r"\s*tail_assertions::check\(\n"
    r"\s*(?P<group>\d+),\n"
    r'\s*r#"(?P<id>[^"]*)"#,\n'
    r'\s*r#"(?P<rules>.*?)"#,\n'
    r"\s*\);\n\}",
    re.S,
)


def load_cases():
    text = open(CASES, encoding="utf-8").read()
    cases = {}
    for match in CASE_RE.finditer(text):
        rules = json.loads(match.group("rules"))
        case_id = match.group("id")
        cases[case_id] = {
            "id": case_id,
            "function": match.group("fn"),
            "group": int(match.group("group")),
            "original": match.group("original"),
            "name": match.group("name"),
            "ignored": "#[ignore" in match.group("attrs"),
            "matchers": [rule.get("matcher") for rule in rules],
            "negated": [bool(rule.get("negate")) for rule in rules],
            "rule_count": len(rules),
            "rules": rules,
        }
    return text, cases


def case_id_for(declaration_id):
    head, line, column = declaration_id.rsplit(":", 2)
    slug = re.sub(r"[^a-zA-Z0-9]", "_", head)
    return "tailstatic_%s_%s_%s" % (slug, line, column)


def main():
    text, cases = load_cases()
    total_functions = len(re.findall(r"^fn tailstatic", text, re.M))
    manifest = json.load(open(MANIFEST, encoding="utf-8"))

    rows = []
    unmatched = []
    for group in ("test_files", "source_files", "retained_test_files"):
        for entry in manifest.get(group, []):
            for case in entry.get("cases") or []:
                declaration = case["id"]
                case_id = case_id_for(declaration)
                translated = cases.get(case_id)
                row = {
                    "declaration": declaration,
                    "case": case_id,
                    "status": case.get("status"),
                    "parameterized": bool(case.get("parameterized")),
                    "boundary": case.get("boundary"),
                    "suite": case.get("suite") or [],
                    "name": case.get("name"),
                    "translated": translated is not None,
                    "ignored": bool(translated and translated["ignored"]),
                    "rule_count": translated["rule_count"] if translated else 0,
                    "matchers": translated["matchers"] if translated else [],
                    "group": translated["group"] if translated else None,
                }
                rows.append(row)
                if not translated:
                    unmatched.append(declaration)

    pending = [r for r in rows if r["status"] == "pending"]
    translated_pending = [r for r in pending if r["translated"] and not r["ignored"]]
    summary = {
        "rust_cases_in_file": total_functions,
        "rust_cases_indexed": len(cases),
        "declarations": len(rows),
        "pending": len(pending),
        "pending_with_executable_rust_case": len(translated_pending),
        "pending_ignored_rust_case": len([r for r in pending if r["translated"] and r["ignored"]]),
        "pending_without_translation": len([r for r in pending if not r["translated"]]),
        "verified": len([r for r in rows if r["status"] == "verified"]),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(
            {
                "summary": summary,
                "pending_with_executable_rust_case": translated_pending,
                "pending_without_translation": unmatched,
                "cases": cases,
            },
            handle,
            indent=1,
            sort_keys=True,
        )
    print(json.dumps(summary, indent=1))
    print(OUT)


if __name__ == "__main__":
    sys.exit(main())
