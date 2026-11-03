# iSQL

Ứng dụng luyện SQL với React, FastAPI và SQL Server. Xem [frontend](frontend/README.md), [backend](backend/README.md) và [hướng dẫn Azure CI/CD](docs/azure-ci-cd.md).

## Chạy toàn bộ project với Docker

Cần Docker Desktop (Linux containers, Docker Compose) và đủ tài nguyên cho SQL Server. Trên máy ARM, image SQL Server `linux/amd64` có thể cần giả lập và không bảo đảm được hỗ trợ/hiệu năng; tham khảo tài liệu Microsoft cho nền tảng của bạn. Image SQL Server Developer dùng cho phát triển, không dùng cho production.

1. Copy `.env.example` thành `.env`, đổi `MSSQL_SA_PASSWORD` và `SECRET_KEY`. Mật khẩu SQL phải đáp ứng quy tắc độ phức tạp SQL Server và chỉ dùng chữ/số vì được chèn vào URL kết nối. Không commit `.env`. Khóa Gemini là tùy chọn.
2. Chạy `docker compose up --build -d --wait` tại thư mục gốc. Compose đợi SQL Server sẵn sàng, tạo database `SQLUIT` nếu chưa có, sau đó khởi động backend và frontend.
3. Truy cập <http://localhost:8080>; API và Swagger ở <http://localhost:8000/docs>. Frontend proxy các request `/api` tới backend trong mạng Compose. `FRONTEND_PORT`, `BACKEND_PORT`, `MSSQL_PORT` có thể đặt trong `.env` nếu các cổng mặc định đã được dùng.
4. Tùy chọn, tạo tài khoản demo bằng `docker compose exec backend python -m scripts.seed` **chỉ trên database local**. Script này tạo tài khoản demo có mật khẩu công khai; không chạy trên Azure production. Dataset mở rộng `seed_dev_data.py` hiện chỉ cho phép SQL Server LocalDB, không dùng được với container.

`docker compose logs -f` xem log; `docker compose down` dừng stack nhưng giữ database và uploads trong named volumes. Chỉ chạy `docker compose down --volumes` khi thực sự muốn xóa dữ liệu local. Nếu đổi mật khẩu SA sau khi volume database đã được tạo, cần đổi mật khẩu bên trong SQL Server hoặc tạo lại database local theo quy trình phù hợp; thay `.env` không tự cập nhật dữ liệu cũ.

Mặc định dịch vụ chỉ mở cổng trên localhost. Cấu hình này dành cho phát triển; môi trường Azure dùng tài nguyên và secrets riêng, không đưa container SQL Server local lên production.
