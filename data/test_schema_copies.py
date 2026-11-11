"""The schemas that scripts/validate-data.mjs reads (scripts/schemas) match the ones the Python side reads (data/schemas)."""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# manifest-v1.json differs on purpose; every other schema is one schema in two places.
SHARED = ('chart-cross-check-v1.json', 'problem-v1.json', 'records-v1.json', 'registry-v1.json', 'submissions-v1.json')


class SchemaCopyTests(unittest.TestCase):
    def test_the_two_copies_of_each_shared_schema_are_identical(self):
        # 2026-11-11: site 84e19908 added ready_at/ready_checked to data/schemas/submissions-v1.json only, and refresh
        # run 42944941435 failed in sync-data ("must NOT have additional properties").
        for name in SHARED:
            with self.subTest(name):
                self.assertEqual((ROOT / 'data/schemas' / name).read_bytes(), (ROOT / 'scripts/schemas' / name).read_bytes())


if __name__ == '__main__':
    unittest.main()
