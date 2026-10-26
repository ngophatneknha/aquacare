import os
import sqlite3
import unittest

import app


class AquaCareTest(unittest.TestCase):
    def setUp(self):
        self.con = sqlite3.connect(":memory:")
        self.con.row_factory = sqlite3.Row
        app.init_db(self.con)

    def test_threshold_alert(self):
        self.assertEqual(app.ingest(self.con, "d1", {"ph": 7.0}), [])
        found = app.ingest(self.con, "d1", {"ph": 3.5, "temp": 45})
        self.assertEqual({m for m, *_ in found}, {"ph", "temp"})

    def test_spike_alert(self):
        for v in (100, 101, 99, 100, 102, 98):
            app.ingest(self.con, "d1", {"flow": v})
        found = app.ingest(self.con, "d1", {"flow": 160})
        self.assertEqual(found[0][0], "flow")
        self.assertIn("đột ngột", found[0][2])

    def test_tamper_detected(self):
        for v in (7.0, 7.1, 7.2):
            app.ingest(self.con, "d1", {"ph": v})
        self.assertTrue(app.verify_chain(self.con)["ok"])
        # kẻ gian sửa thẳng trong DB để che số đo xấu
        self.con.execute("UPDATE ledger SET body='{\"ph\": 7.5}' WHERE seq=2")
        res = app.verify_chain(self.con)
        self.assertFalse(res["ok"])
        self.assertEqual(res["broken_at"], 2)

    def test_rejects_empty_reading(self):
        with self.assertRaises(ValueError):
            app.ingest(self.con, "d1", {"device": "d1"})


if __name__ == "__main__":
    unittest.main()
