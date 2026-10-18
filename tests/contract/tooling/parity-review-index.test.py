"""Inventory regression checks; no gateway processes or parity credit."""
import importlib.util
import json
import pathlib
import unittest

spec = importlib.util.spec_from_file_location(
    "parity_review_index", pathlib.Path(__file__).with_name("parity-review-index.py")
)
index = importlib.util.module_from_spec(spec)
spec.loader.exec_module(index)


class GeneratedVariantInventory(unittest.TestCase):
    def test_raw_string_delimiters_do_not_hide_generated_cases(self):
        for count in (2, 3):
            hashes = "#" * count
            expected = "#" * (count - 1) + " Jait"
            rules = json.dumps([{"matcher": "toContain", "expected": expected}])
            source = (
                "// fixtures/example.test.ts: hashes in expected text\n"
                "#[test]\nfn tailstatic_example() {\n"
                " tail_assertions::check(\n 0,\n r#\"tailstatic_example\"#,\n"
                + " r" + hashes + '"' + rules + '"' + hashes + ",\n );\n}\n"
            )
            _, cases = index.load_cases(source)
            self.assertEqual(cases["tailstatic_example"]["rules"][0]["expected"], expected)

    def test_parameterized_registration_is_found_without_base_registration(self):
        declaration = "packages/gateway/src/service.test.ts:12:3"
        base = index.case_id_for(declaration)
        cases = {
            base + "_for0_each0": {"id": base + "_for0_each0", "ignored": False},
            base + "_for0_each1": {"id": base + "_for0_each1", "ignored": True},
            base + "0_for0": {"id": base + "0_for0", "ignored": False},
            base + "_unknown": {"id": base + "_unknown", "ignored": False},
        }
        variants = index.translated_variants(declaration, cases)
        self.assertEqual(
            [row["id"] for row in variants],
            [base + "_for0_each0", base + "_for0_each1"],
        )
        self.assertEqual([row["ignored"] for row in variants], [False, True])

    def test_base_runtime_and_conditional_registrations_remain_distinct(self):
        declaration = "packages/gateway/src/service.test.ts:12:3"
        base = index.case_id_for(declaration)
        names = [base, base + "_runtime", base + "_branch"]
        cases = {name: {"id": name, "ignored": False} for name in names}
        self.assertEqual(
            [row["id"] for row in index.translated_variants(declaration, cases)],
            names,
        )
        self.assertEqual(
            index.translated_variants(declaration.replace(":12:", ":13:"), cases),
            [],
        )


if __name__ == "__main__":
    unittest.main()
