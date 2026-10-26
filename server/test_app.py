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


class SensorAndMigrationTest(unittest.TestCase):
    def test_out_of_physical_range_is_sensor_fault(self):
        con = sqlite3.connect(":memory:")
        con.row_factory = sqlite3.Row
        app.init_db(con)
        found = app.ingest(con, "d1", {"ph": 15.2, "tds": -4, "temp": 45})
        self.assertEqual({(m, k) for m, _, _, k in found}, {("ph", "sensor"), ("tds", "sensor"), ("temp", "threshold")})

    def test_migrates_old_ack_schema(self):
        con = sqlite3.connect(":memory:")
        con.row_factory = sqlite3.Row
        con.executescript("""
        CREATE TABLE devices(id TEXT PRIMARY KEY, name TEXT, owner TEXT, key TEXT NOT NULL);
        CREATE TABLE alerts(id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, device TEXT,
            metric TEXT, value REAL, reason TEXT, ack INTEGER DEFAULT 0);
        INSERT INTO alerts(ts,device,metric,value,reason,ack) VALUES (1,'d','ph',3,'x',1),(2,'d','ph',3,'x',0);
        """)
        app.init_db(con)
        self.assertEqual([r["status"] for r in con.execute("SELECT status FROM alerts ORDER BY id")], ["resolved", "new"])
        self.assertIn("calibrated_ts", app.columns(con, "devices"))
        app.init_db(con)  # chạy lại không lỗi


class ApiTest(unittest.TestCase):
    def setUp(self):
        import tempfile, threading
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db = app.DB_PATH
        app.DB_PATH = os.path.join(self.tmp.name, "t.db")
        with app.db() as con:
            app.init_db(con)
        self.srv = app.ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.post("/api/devices", {"id": "D1", "key": "k1"})
        self.post("/api/readings", {"device": "D1", "ph": 3.0}, {"X-Device-Key": "k1"})

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()
        app.DB_PATH = self.old_db
        self.tmp.cleanup()

    def call(self, method, path, body=None, headers=None):
        import http.client, json
        c = http.client.HTTPConnection("127.0.0.1", self.srv.server_address[1])
        c.request(method, path, json.dumps(body) if body is not None else None,
                  {"Content-Type": "application/json", **(headers or {})})
        r = c.getresponse()
        data = json.loads(r.read() or b"null")
        c.close()
        return r.status, data

    def post(self, path, body, headers=None):
        return self.call("POST", path, body, headers if headers is not None else {"X-Admin-Key": app.ADMIN_KEY})

    def test_alert_workflow(self):
        _, alerts = self.call("GET", "/api/alerts")
        aid = alerts[0]["id"]
        self.assertEqual((alerts[0]["status"], alerts[0]["kind"]), ("new", "threshold"))
        self.assertEqual(self.post("/api/alerts/update", {"id": aid, "status": "investigating"})[0], 200)
        self.assertEqual(self.call("GET", "/api/devices")[1][0]["open_alerts"], 1)
        self.assertEqual(self.post("/api/alerts/update", {"id": aid, "status": "false_alarm", "note": "đầu dò bẩn"})[0], 200)
        a = self.call("GET", "/api/alerts")[1][0]
        self.assertEqual((a["status"], a["note"]), ("false_alarm", "đầu dò bẩn"))
        self.assertIsNotNone(a["closed_ts"])
        self.assertEqual(self.call("GET", "/api/devices")[1][0]["open_alerts"], 0)
        self.assertEqual(self.post("/api/alerts/update", {"id": aid, "status": "xoa"})[0], 400)
        self.assertEqual(self.post("/api/alerts/update", {"id": 999, "status": "resolved"})[0], 404)
        self.assertEqual(self.post("/api/alerts/update", {"id": aid, "status": "resolved"}, {})[0], 401)
        kinds = [e["kind"] for e in self.call("GET", "/api/audit")[1]]
        self.assertEqual(kinds.count("alert_update"), 2)

    def test_calibration(self):
        status, res = self.post("/api/devices/calibrate", {"id": "D1", "note": "pH 4/7"})
        self.assertEqual(status, 200)
        self.assertEqual(self.call("GET", "/api/devices")[1][0]["calibrated_ts"], res["calibrated_ts"])
        self.assertEqual(self.post("/api/devices/calibrate", {"id": "nope"})[0], 404)

    def test_threshold_validation(self):
        self.assertEqual(self.post("/api/thresholds", {"ph": [9, 5]})[0], 400)
        self.assertEqual(self.post("/api/thresholds", {"ph": ["a", 9]})[0], 400)
        self.assertEqual(self.post("/api/thresholds", {"ph": [6, 8.5], "flow": [None, None]})[0], 200)
        self.assertEqual(self.call("GET", "/api/thresholds")[1]["ph"], [6, 8.5])
        self.assertTrue(self.call("GET", "/api/verify")[1]["ok"])


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
