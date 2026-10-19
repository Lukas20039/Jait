"""Reference review annotations must not hide source or inventory changes."""
import copy
import importlib.util
from pathlib import Path
import sys
import unittest

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location(
    "native_validation", ROOT / "packages/gateway-rust/tooling/validate-frozen.py"
)
validation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validation)


class InventoryMetadataTests(unittest.TestCase):
    def setUp(self):
        self.before = {
            "policy": "strict",
            "limits": {"max_calls": 64},
            "source_files": [{
                "path": "packages/gateway/src/example.ts",
                "fingerprint": "abc",
                "lane": "runtime",
                "direct_test_references": ["example.test.ts"],
                "status": "pending",
                "gap": "unreviewed",
                "rust_cases": [],
            }],
        }
        self.after = copy.deepcopy(self.before)

    def allowed(self):
        return validation.inventory_review_metadata_only(self.before, self.after)

    def test_review_annotations_are_separate_from_runtime_source_drift(self):
        row = self.after["source_files"][0]
        row.update(status="verified", gap="reviewed", parity_review="asserted",
                   rust_cases=[{"id": "reference-only", "report": "new/report.json"}])
        self.assertTrue(self.allowed())

    def test_source_fingerprint_change_is_rejected(self):
        self.after["source_files"][0]["fingerprint"] = "changed"
        self.assertFalse(self.allowed())

    def test_source_paths_additions_and_removals_are_rejected(self):
        for rows in ([], self.before["source_files"] * 2,
                     [self.before["source_files"][0] | {"path": "other.ts"}]):
            self.after["source_files"] = rows
            self.assertFalse(self.allowed())

    def test_policy_limits_lanes_and_contract_inputs_are_rejected(self):
        for key, value in (("lane", "changed"), ("direct_test_references", []),
                           ("unknown_native_input", True)):
            self.after = copy.deepcopy(self.before)
            self.after["source_files"][0][key] = value
            self.assertFalse(self.allowed())
        for key, value in (("policy", "weakened"), ("limits", {})):
            self.after = copy.deepcopy(self.before)
            self.after[key] = value
            self.assertFalse(self.allowed())

    def test_malformed_inventories_fail_closed(self):
        for value in (None, [], {}, {"source_files": None},
                      {"source_files": [None]}, {"source_files": [{"path": "x"}]}):
            self.assertFalse(validation.inventory_review_metadata_only(self.before, value))


if __name__ == "__main__":
    unittest.main()
