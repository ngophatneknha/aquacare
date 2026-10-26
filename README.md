# AQUA CARE

Hệ thống IoT giám sát và cảnh báo sớm chất lượng nước thải công nghiệp (đội Rocket Innostars, HITC Innostar 2026).

```
[Cảm biến pH, nhiệt độ, TDS, độ đục, lưu lượng] → ESP32 → WiFi/HTTP → Server (Python + SQLite) → Dashboard web
                                                                         │
                                                         Cảnh báo cho doanh nghiệp & cơ quan quản lý
```

## Chạy thử (không cần phần cứng)

Cần Python 3.10+ (server không cần thư viện ngoài) và Node.js 18+ (để build giao diện).

Build giao diện một lần (và sau mỗi lần sửa code trong `web/`):

```bash
cd web && npm install && npm run build
```

Chạy server, server sẽ phục vụ luôn giao diện đã build ở `web/dist`:

```bash
python server/app.py
```

Mở terminal thứ hai:

```bash
python simulator.py
```

Mở http://localhost:8000 để xem dashboard.

**Khi sửa giao diện**: để `python server/app.py` chạy, rồi trong `web/` chạy `npm run dev` và mở http://localhost:5173.
Vite tự tải lại khi lưu file và chuyển `/api` sang server Python.

**Test**: `cd server && python -m unittest` (server) và `cd web && npm test` (logic giao diện). Kiểm tra code: `cd web && npm run lint`.

## Deploy bản demo lên Netlify

Netlify chỉ chạy giao diện tĩnh, không chạy server Python, nên bản trên Netlify dùng **dữ liệu giả lập ngay trong trình duyệt**
(2 nhà máy ảo, có sự cố, cảnh báo, chuỗi băm). Trang có nhãn "Bản demo · dữ liệu giả lập" để không bị nhầm với số đo thật.

Netlify → *Add new site* → *Import from GitHub* → chọn repo này. Không cần chỉnh gì: `netlify.toml` đã khai báo
thư mục `web`, lệnh build và biến `VITE_DEMO=true`.

Thử bản demo ở máy: `cd web && VITE_DEMO=true npm run build && npx vite preview`.

## Có gì trong MVP

| Phần | File | Làm gì |
|---|---|---|
| Server | `server/app.py` | Nhận số đo, phát hiện vượt ngưỡng + biến động đột ngột, lưu cảnh báo, API |
| Dashboard | `web/` (React 18 + Vite 5 + TailwindCSS 3, Chart.js) | Bể pH sóng động, 4 đồng hồ chỉ số, biểu đồ có ngưỡng QCVN, cảnh báo + toast, kiểm tra toàn vẹn, sáng/tối |
| Firmware | `firmware/aquacare_esp32/` | Đọc 5 cảm biến, gửi lên server mỗi 30 giây |
| Giả lập | `simulator.py` | 2 nhà máy ảo, thỉnh thoảng giả lập xả thải bất thường |

**Chống làm sai lệch dữ liệu** (vấn đề nêu trong thuyết minh, tháng 4/2026): mọi số đo và mọi thao tác quản trị
(thêm thiết bị, đổi ngưỡng, xác nhận cảnh báo) được ghi vào một sổ cái nối bằng chuỗi băm SHA-256.
Sửa một bản ghi cũ trong DB sẽ làm `/api/verify` báo lỗi tại đúng bản ghi đó.

**Ngưỡng mặc định**: pH 5.5–9, nhiệt độ ≤ 40°C theo QCVN 40:2011/BTNMT cột B. TDS ≤ 2000 ppm, độ đục ≤ 100 NTU
là giá trị tham khảo (QCVN 40 không quy định) — chỉnh theo ngành của từng nhà máy.

## API

| Method | Đường dẫn | Header | Ghi chú |
|---|---|---|---|
| POST | `/api/devices` | `X-Admin-Key` | `{"id","name","owner"}` → trả về `key` cho thiết bị |
| POST | `/api/readings` | `X-Device-Key` | `{"device","ph","temp","tds","turbidity","flow"}` |
| GET | `/api/devices`, `/api/readings?device=`, `/api/alerts`, `/api/audit`, `/api/verify` | | |
| GET/POST | `/api/thresholds` | `X-Admin-Key` khi POST | `{"ph":[5.5,9]}` |
| POST | `/api/alerts/ack` | `X-Admin-Key` | `{"id"}` |

Biến môi trường: `PORT`, `AQUACARE_DB`, `AQUACARE_ADMIN_KEY` (mặc định `admin-dev-key` — **phải đổi khi triển khai**).

## Lộ trình

1. **Giai đoạn 1 (đã xong — MVP này)**: server, dashboard, firmware, giả lập, kiểm tra toàn vẹn dữ liệu.
2. **Giai đoạn 2 — phần cứng**: lắp ESP32 + cảm biến, hiệu chuẩn pH (dung dịch chuẩn 4.0/7.0) và TDS, thử với mẫu nước thải;
   vỏ chống nước, đầu dò công nghiệp chịu ăn mòn; bộ đệm thẻ SD khi mất mạng.
3. **Giai đoạn 3 — vận hành**: HTTPS, tài khoản riêng cho doanh nghiệp / cơ quan quản lý (mỗi doanh nghiệp chỉ thấy thiết bị của mình),
   gửi cảnh báo qua Zalo/SMS/email, ký số đo bằng HMAC ngay trên thiết bị, định kỳ gửi mã băm mới nhất cho cơ quan quản lý lưu giữ.
4. **Giai đoạn 4 — AI**: phân tích lịch sử đo, dự báo xu hướng, gợi ý nguyên nhân & hướng xử lý cho doanh nghiệp.

## Giới hạn hiện tại

- Chuỗi băm phát hiện được sửa dữ liệu lẻ tẻ, nhưng người có toàn quyền server có thể tính lại cả chuỗi.
  Cần thêm bước 3 ở lộ trình (HMAC trên thiết bị + cơ quan quản lý giữ mã băm) mới chống được triệt để.
- Chưa phân quyền nhiều người dùng; một khóa quản trị chung.
- Firmware chưa được biên dịch/thử trên mạch thật; hệ số hiệu chuẩn là giá trị mẫu.
