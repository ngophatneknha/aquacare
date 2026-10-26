"""AQUA CARE server: nhận số đo từ thiết bị, phát hiện bất thường, lưu chuỗi băm chống sửa dữ liệu.

Chỉ dùng thư viện chuẩn Python. Chạy: python server/app.py  (mặc định cổng 8000)
"""
import hashlib
import json
import mimetypes
import sys
import os
import sqlite3
import statistics
import threading
import time
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).parent
DB_PATH = os.environ.get("AQUACARE_DB", str(ROOT / "aquacare.db"))
WEB_DIST = Path(os.environ.get("AQUACARE_WEB", ROOT.parent / "web" / "dist")).resolve()
# Windows đôi khi map .js sang text/plain qua registry, trình duyệt sẽ từ chối chạy module
for _type, _ext in (("text/javascript", ".js"), ("text/css", ".css"), ("font/woff2", ".woff2"), ("font/woff", ".woff")):
    mimetypes.add_type(_type, _ext)
ADMIN_KEY = os.environ.get("AQUACARE_ADMIN_KEY", "admin-dev-key")  # đổi khi triển khai thật

METRICS = ("ph", "temp", "tds", "turbidity", "flow")
# Ngưỡng mặc định. pH và nhiệt độ theo QCVN 40:2011/BTNMT cột B; TDS/độ đục/lưu lượng
# không có trong QCVN 40 nên là giá trị tham khảo, chỉnh qua API /api/thresholds.
DEFAULT_THRESHOLDS = {
    "ph": [5.5, 9.0],
    "temp": [None, 40.0],
    "tds": [None, 2000.0],
    "turbidity": [None, 100.0],
    "flow": [None, None],
}
# Dải đo vật lý của đầu dò: số ngoài dải này là lỗi cảm biến, không phải ô nhiễm
PHYSICAL = {"ph": (0, 14), "temp": (-5, 100), "tds": (0, 20000), "turbidity": (0, 4000), "flow": (0, None)}
ALERT_STATUSES = ("new", "investigating", "resolved", "false_alarm")
OPEN_STATUSES = ("new", "investigating")
SPIKE_WINDOW = 20   # số mẫu gần nhất để tính trung bình
WRITE_LOCK = threading.Lock()  # chuỗi băm cần ghi tuần tự
SPIKE_Z = 4.0       # lệch > 4 độ lệch chuẩn => biến động bất thường


@contextmanager
def db():
    # "with sqlite3.connect()" chỉ commit/rollback, không đóng kết nối
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    try:
        with con:
            yield con
    finally:
        con.close()


def init_db(con):
    con.executescript("""
    CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY, name TEXT, owner TEXT, key TEXT NOT NULL,
        calibrated_ts REAL);
    CREATE TABLE IF NOT EXISTS thresholds(metric TEXT PRIMARY KEY, lo REAL, hi REAL);
    -- ledger: mọi số đo và mọi thao tác quản trị, nối bằng chuỗi băm SHA-256
    CREATE TABLE IF NOT EXISTS ledger(seq INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, kind TEXT,
        device TEXT, body TEXT, prev TEXT, hash TEXT);
    CREATE TABLE IF NOT EXISTS alerts(id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, device TEXT,
        metric TEXT, value REAL, reason TEXT, kind TEXT DEFAULT 'threshold', status TEXT DEFAULT 'new',
        note TEXT DEFAULT '', closed_ts REAL);
    CREATE INDEX IF NOT EXISTS ledger_dev ON ledger(device, kind, seq);
    """)
    # DB tạo từ bản cũ: thêm cột mới, chuyển cờ ack cũ sang trạng thái
    add_columns(con, "devices", {"calibrated_ts": "REAL"})
    if add_columns(con, "alerts", {"kind": "TEXT DEFAULT 'threshold'", "status": "TEXT DEFAULT 'new'",
                                   "note": "TEXT DEFAULT ''", "closed_ts": "REAL"}):
        if "ack" in columns(con, "alerts"):
            con.execute("UPDATE alerts SET status='resolved', closed_ts=ts WHERE ack=1")
    for m, (lo, hi) in DEFAULT_THRESHOLDS.items():
        con.execute("INSERT OR IGNORE INTO thresholds VALUES(?,?,?)", (m, lo, hi))
    con.commit()


def columns(con, table):
    return {r[1] for r in con.execute(f"PRAGMA table_info({table})")}


def add_columns(con, table, cols):
    """Thêm các cột còn thiếu; trả về True nếu có thêm."""
    missing = {c: d for c, d in cols.items() if c not in columns(con, table)}
    for c, d in missing.items():
        con.execute(f"ALTER TABLE {table} ADD COLUMN {c} {d}")
    return bool(missing)


def chain_hash(prev, ts, kind, device, body):
    return hashlib.sha256(f"{prev}|{ts!r}|{kind}|{device}|{body}".encode()).hexdigest()


def append(con, kind, device, data):
    body = json.dumps(data, sort_keys=True, ensure_ascii=False)
    row = con.execute("SELECT hash FROM ledger ORDER BY seq DESC LIMIT 1").fetchone()
    prev = row["hash"] if row else "0" * 64
    ts = time.time()
    h = chain_hash(prev, ts, kind, device, body)
    con.execute("INSERT INTO ledger(ts,kind,device,body,prev,hash) VALUES(?,?,?,?,?,?)",
                (ts, kind, device, body, prev, h))
    return ts


def verify_chain(con):
    prev = "0" * 64
    n = 0
    for r in con.execute("SELECT * FROM ledger ORDER BY seq"):
        if r["prev"] != prev or chain_hash(prev, r["ts"], r["kind"], r["device"], r["body"]) != r["hash"]:
            return {"ok": False, "broken_at": r["seq"], "checked": n}
        prev = r["hash"]
        n += 1
    return {"ok": True, "checked": n}


def detect(con, device, reading):
    """Trả về danh sách (metric, value, reason, kind) bất thường; kind: sensor | threshold | spike."""
    th = {r["metric"]: (r["lo"], r["hi"]) for r in con.execute("SELECT * FROM thresholds")}
    recent = [json.loads(r["body"]) for r in con.execute(
        "SELECT body FROM ledger WHERE device=? AND kind='reading' ORDER BY seq DESC LIMIT ?",
        (device, SPIKE_WINDOW))]
    out = []
    for m in METRICS:
        v = reading.get(m)
        if v is None:
            continue
        lo, hi = th.get(m, (None, None))
        plo, phi = PHYSICAL[m]
        if v < plo or (phi is not None and v > phi):
            out.append((m, v, "ngoài dải đo, nghi lỗi cảm biến", "sensor"))
        elif lo is not None and v < lo:
            out.append((m, v, f"dưới ngưỡng {lo}", "threshold"))
        elif hi is not None and v > hi:
            out.append((m, v, f"vượt ngưỡng {hi}", "threshold"))
        else:
            hist = [r[m] for r in recent if r.get(m) is not None]
            if len(hist) >= 5:
                mu, sd = statistics.fmean(hist), statistics.pstdev(hist)
                if sd > 0 and abs(v - mu) / sd > SPIKE_Z:
                    out.append((m, v, f"biến động đột ngột (TB {mu:.2f})", "spike"))
    return out


def ingest(con, device, reading):
    reading = {m: float(reading[m]) for m in METRICS if reading.get(m) is not None}
    if not reading:
        raise ValueError("không có chỉ số hợp lệ")
    found = detect(con, device, reading)  # trước khi ghi, để mẫu hiện tại không tự kéo trung bình
    ts = append(con, "reading", device, reading)
    for m, v, why, kind in found:
        con.execute("INSERT INTO alerts(ts,device,metric,value,reason,kind) VALUES(?,?,?,?,?,?)",
                    (ts, device, m, v, why, kind))
    con.commit()
    return found


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj=None, ctype="application/json", raw=None):
        data = raw if raw is not None else json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 65536:
            raise ValueError("payload quá lớn")
        return json.loads(self.rfile.read(n) or b"{}")

    def _admin(self):
        return self.headers.get("X-Admin-Key") == ADMIN_KEY

    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        with db() as con:
            if u.path == "/api/devices":
                rows = con.execute("SELECT id,name,owner,calibrated_ts FROM devices").fetchall()
                res = []
                for r in rows:
                    last = con.execute("SELECT ts,body FROM ledger WHERE device=? AND kind='reading' "
                                       "ORDER BY seq DESC LIMIT 1", (r["id"],)).fetchone()
                    open_alerts = con.execute("SELECT COUNT(*) FROM alerts WHERE device=? AND status IN (?,?)",
                                              (r["id"], *OPEN_STATUSES)).fetchone()[0]
                    res.append({**dict(r), "last_ts": last and last["ts"],
                                "last": last and json.loads(last["body"]), "open_alerts": open_alerts})
                return self._send(200, res)
            if u.path == "/api/readings":
                limit = min(int(q.get("limit", 200)), 5000)
                rows = con.execute("SELECT ts,body FROM ledger WHERE device=? AND kind='reading' "
                                   "ORDER BY seq DESC LIMIT ?", (q.get("device"), limit)).fetchall()
                return self._send(200, [{"ts": r["ts"], **json.loads(r["body"])} for r in reversed(rows)])
            if u.path == "/api/alerts":
                rows = con.execute("SELECT id,ts,device,metric,value,reason,kind,status,note,closed_ts "
                                   "FROM alerts ORDER BY id DESC LIMIT 500").fetchall()
                return self._send(200, [dict(r) for r in rows])
            if u.path == "/api/thresholds":
                return self._send(200, {r["metric"]: [r["lo"], r["hi"]] for r in con.execute("SELECT * FROM thresholds")})
            if u.path == "/api/audit":
                rows = con.execute("SELECT seq,ts,kind,device,body,hash FROM ledger WHERE kind!='reading' "
                                   "ORDER BY seq DESC LIMIT 200").fetchall()
                return self._send(200, [dict(r) for r in rows])
            if u.path == "/api/verify":
                return self._send(200, verify_chain(con))
        if u.path.startswith("/api/"):
            return self._send(404, {"error": "not found"})
        self._static(u.path)

    def _static(self, path):
        """Phục vụ giao diện React đã build (web/dist)."""
        if not (WEB_DIST / "index.html").is_file():
            return self._send(503, ctype="text/plain",
                              raw="Chưa build giao diện: cd web && npm install && npm run build".encode())
        f = (WEB_DIST / path.lstrip("/")).resolve()
        if not f.is_relative_to(WEB_DIST) or not f.is_file():
            f = WEB_DIST / "index.html"  # chặn ../ và trả trang chính cho đường dẫn lạ
        self._send(200, ctype=mimetypes.guess_type(f.name)[0] or "application/octet-stream", raw=f.read_bytes())

    def do_POST(self):
        u = urlparse(self.path)
        try:
            body = self._body()
            with WRITE_LOCK, db() as con:
                if u.path == "/api/readings":
                    dev = con.execute("SELECT key FROM devices WHERE id=?", (body.get("device"),)).fetchone()
                    if not dev or dev["key"] != self.headers.get("X-Device-Key"):
                        return self._send(401, {"error": "sai thiết bị hoặc khóa"})
                    found = ingest(con, body["device"], body)
                    return self._send(200, {"ok": True, "alerts": [
                        {"metric": m, "value": v, "reason": w, "kind": k} for m, v, w, k in found]})
                if not self._admin():
                    return self._send(401, {"error": "cần X-Admin-Key"})
                if u.path == "/api/devices":
                    key = body.get("key") or os.urandom(16).hex()
                    con.execute("INSERT INTO devices(id,name,owner,key) VALUES(?,?,?,?)", (body["id"], body.get("name", ""), body.get("owner", ""), key))
                    append(con, "device_add", body["id"], {"name": body.get("name", ""), "owner": body.get("owner", "")})
                    con.commit()
                    return self._send(200, {"id": body["id"], "key": key})
                if u.path == "/api/devices/calibrate":
                    if not con.execute("SELECT 1 FROM devices WHERE id=?", (body["id"],)).fetchone():
                        return self._send(404, {"error": "không có thiết bị này"})
                    ts = append(con, "calibration", body["id"], {"note": str(body.get("note", ""))[:500]})
                    con.execute("UPDATE devices SET calibrated_ts=? WHERE id=?", (ts, body["id"]))
                    con.commit()
                    return self._send(200, {"ok": True, "calibrated_ts": ts})
                if u.path == "/api/thresholds":
                    for m, (lo, hi) in body.items():
                        if m not in METRICS:
                            raise ValueError(f"chỉ số lạ: {m}")
                        if any(x is not None and (isinstance(x, bool) or not isinstance(x, (int, float))) for x in (lo, hi)):
                            raise ValueError(f"ngưỡng {m} phải là số hoặc để trống")
                        if lo is not None and hi is not None and lo > hi:
                            raise ValueError(f"ngưỡng dưới của {m} lớn hơn ngưỡng trên")
                    for m, (lo, hi) in body.items():
                        con.execute("UPDATE thresholds SET lo=?,hi=? WHERE metric=?", (lo, hi, m))
                    append(con, "threshold_change", None, body)  # thay đổi ngưỡng được ghi vào nhật ký
                    con.commit()
                    return self._send(200, {"ok": True})
                if u.path == "/api/alerts/update":
                    status, note = body["status"], str(body.get("note", ""))[:1000]
                    if status not in ALERT_STATUSES:
                        raise ValueError(f"trạng thái lạ: {status}")
                    closed = time.time() if status not in OPEN_STATUSES else None
                    cur = con.execute("UPDATE alerts SET status=?, note=?, closed_ts=? WHERE id=?",
                                      (status, note, closed, body["id"]))
                    if not cur.rowcount:
                        return self._send(404, {"error": "không có cảnh báo này"})
                    append(con, "alert_update", None, {"id": body["id"], "status": status, "note": note})
                    con.commit()
                    return self._send(200, {"ok": True})
        except (ValueError, KeyError, TypeError, sqlite3.IntegrityError) as e:
            return self._send(400, {"error": str(e)})
        self._send(404, {"error": "not found"})

    def log_message(self, *a):
        pass


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # console Windows mặc định không in được tiếng Việt
    with db() as con:
        init_db(con)
    port = int(os.environ.get("PORT", 8000))
    print(f"AQUA CARE đang chạy: http://localhost:{port}")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
