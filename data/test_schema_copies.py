"""The schemas that scripts/validate-data.mjs reads (scripts/schemas) match the ones the Python side reads (data/schemas)."""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Every schema in scripts/schemas is a copy of the one in data/schemas. data/schemas/manifest-v1.json has no copy:
# scripts/validate-data.mjs does not read it.
SHARED = sorted(p.name for p in (ROOT / 'scripts/schemas').glob('*.json'))


class SchemaCopyTests(unittest.TestCase):
    def test_the_two_copies_of_each_shared_schema_are_identical(self):
        self.assertGreaterEqual(len(SHARED), 5)
        # 2026-11-11: site 84e19908 added ready_at/ready_checked to data/schemas/submissions-v1.json only, and refresh
        # run 42944941435 failed in sync-data ("must NOT have additional properties").
        for name in SHARED:
            with self.subTest(name):
                self.assertEqual((ROOT / 'data/schemas' / name).read_bytes(), (ROOT / 'scripts/schemas' / name).read_bytes())


if __name__ == '__main__':
    unittest.main()
