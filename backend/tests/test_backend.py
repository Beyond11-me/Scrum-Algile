import sys
import os
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

class TestBackendImport(unittest.TestCase):
    def test_imports(self):
        import app.main
        self.assertIsNotNone(app.main.app)

if __name__ == "__main__":
    unittest.main()
