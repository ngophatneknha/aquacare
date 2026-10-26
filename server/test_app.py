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


class StaticTest(unittest.TestCase):
    def setUp(self):
        import tempfile, threading
        from pathlib import Path
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        (root / "dist" / "assets").mkdir(parents=True)
        (root / "dist" / "index.html").write_text("INDEX")
        (root / "dist" / "assets" / "a.js").write_text("JS")
        (root / "secret.txt").write_text("SECRET")
        self.old = app.WEB_DIST
        app.WEB_DIST = (root / "dist").resolve()
        self.srv = app.ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()
        app.WEB_DIST = self.old
        self.tmp.cleanup()

    def fetch(self, path):
        import http.client
        c = http.client.HTTPConnection("127.0.0.1", self.srv.server_address[1])
        c.request("GET", path)
        r = c.getresponse()
        return r.status, r.getheader("Content-Type"), r.read().decode()

    def test_serves_assets_with_js_type(self):
        status, ctype, body = self.fetch("/assets/a.js")
        self.assertEqual((status, body), (200, "JS"))
        self.assertTrue(ctype.startswith("text/javascript"))

    def test_spa_fallback_and_no_traversal(self):
        self.assertEqual(self.fetch("/thiet-bi/KCN-01")[2], "INDEX")
        self.assertEqual(self.fetch("/../secret.txt")[2], "INDEX")
        self.assertEqual(self.fetch("/%2e%2e/secret.txt")[2], "INDEX")

    def test_unknown_api_is_404(self):
        self.assertEqual(self.fetch("/api/nope")[0], 404)


if __name__ == "__main__":
    unittest.main()
