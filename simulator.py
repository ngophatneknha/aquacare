"""Giả lập thiết bị AQUA CARE khi chưa có phần cứng. Thỉnh thoảng bơm vào sự cố để thử cảnh báo.

python simulator.py [--url http://127.0.0.1:8000] [--admin-key admin-dev-key] [--interval 2]
"""
import argparse
import json
import sys
import random
import time
import urllib.error
import urllib.request


def post(url, data, headers):
    req = urllib.request.Request(url, json.dumps(data).encode(), {"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # console Windows mặc định không in được tiếng Việt
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8000")
    ap.add_argument("--admin-key", default="admin-dev-key")
    ap.add_argument("--interval", type=float, default=2)
    a = ap.parse_args()

    devices = [("KCN-01", "Nhà máy dệt nhuộm A", "KCN Ngũ Huyện Khê"), ("KCN-02", "Nhà máy giấy B", "KCN Phong Khê")]
    keys = {}
    for did, name, owner in devices:
        try:
            keys[did] = post(a.url + "/api/devices", {"id": did, "name": name, "owner": owner, "key": f"sim-{did}"},
                             {"X-Admin-Key": a.admin_key})["key"]
        except urllib.error.HTTPError:  # đã đăng ký từ lần chạy trước
            keys[did] = f"sim-{did}"

    print("Đang gửi dữ liệu, Ctrl+C để dừng")
    while True:
        for did, *_ in devices:
            r = {"device": did, "ph": random.gauss(7.2, 0.15), "temp": random.gauss(29, 0.5),
                 "tds": random.gauss(800, 30), "turbidity": random.gauss(25, 2), "flow": random.gauss(120, 5)}
            if random.random() < 0.03:  # sự cố: tắt hệ thống xử lý, nước thải thô xả ra
                r.update(ph=random.choice([3.8, 10.5]), turbidity=180, tds=2600)
                print(f"!! {did}: giả lập xả thải bất thường")
            res = post(a.url + "/api/readings", r, {"X-Device-Key": keys[did]})
            for al in res["alerts"]:
                print(f"   cảnh báo {did} {al['metric']}={al['value']:.2f}: {al['reason']}")
        time.sleep(a.interval)


if __name__ == "__main__":
    main()
