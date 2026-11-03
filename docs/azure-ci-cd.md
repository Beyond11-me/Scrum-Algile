# CI/CD trên Azure

## Kiến trúc và luồng

- `frontend-ci.yml` kiểm tra TypeScript, service tests và build React. `backend-ci.yml` chạy unit test với SQLite, kiểm tra workflow, sau đó chạy Docker Compose với SQL Server thật. Hai workflow này chạy độc lập trên pull request và push ngoài `production`.
- `publish.yml` chạy khi push `production` hoặc khi được gọi thủ công trên nhánh đó. Workflow gọi lại cả hai CI như reusable workflows trong **cùng một run và commit**. Mặc định publish và deploy bị bỏ qua; khi bật `ENABLE_AZURE_DEPLOYMENT`, hai CI phải thành công trước khi image backend đã kiểm thử được đẩy lên Azure Container Registry (ACR) với Git SHA.
- `deploy.yml` là reusable workflow do `publish.yml` gọi sau khi publish thành công. Workflow triển khai image lên App Service, kiểm tra revision và kết nối database, sau đó triển khai frontend bundle đã build trong cùng run lên Azure Static Web Apps.
- Pull request không nhận secrets triển khai. Hai job publish và deploy đều dùng GitHub Environment `production`; nếu bật required reviewers, từng job có thể cần duyệt riêng.
- Backend dùng Azure SQL Database; container đã cài Microsoft ODBC Driver 18. Image cho từng commit được giữ trong ACR để hỗ trợ rollback.

Pipeline này cần tài nguyên và cấu hình bên dưới; chỉ thêm workflow vào repository không tự tạo tài nguyên Azure. `/healthz` kiểm tra revision và `SELECT 1`, chưa chứng minh các nghiệp vụ SQL hoạt động. Chưa có staging, deployment slot, tự rollback, test Azure SQL hay kiểm thử giao diện end-to-end. Artifacts của CI được giữ 7 ngày; approval lâu hơn cần chạy lại workflow.

## 1. Chuẩn bị Azure

Tạo các tài nguyên cùng môi trường production: Azure Container Registry, App Service **Linux / custom container**, Azure Static Web Apps và Azure SQL Database. Chọn khu vực, SKU và mạng phù hợp ngân sách và nhu cầu của nhóm. Đảm bảo App Service có đường mạng đến ACR và Azure SQL; nếu dùng private endpoint cần cấu hình VNet/DNS tương ứng.

Thiết lập App Service:

1. Bật system-assigned managed identity, cấp quyền kéo image trên ACR (ví dụ `AcrPull` với registry dùng RBAC truyền thống), và bật `acrUseManagedIdentityCreds`. Với registry dùng ABAC, dùng vai trò repository thích hợp thay cho `AcrPull`/`AcrPush`.
2. Đặt application settings `WEBSITES_PORT=8000`, `DATABASE_URL`, `SECRET_KEY`, `CORS_ORIGINS` và khóa AI nếu dùng. Không cấu hình đè `APP_REVISION`: giá trị này được nhúng vào image để xác minh bản deploy. Dùng Key Vault references cho secrets nếu có thể. `CORS_ORIGINS` là danh sách origin frontend HTTPS ngăn cách bằng dấu phẩy, không có dấu `/` cuối, ví dụ `https://example.azurestaticapps.net`.
3. Dùng chuỗi `mssql+pyodbc` cho Azure SQL với **ODBC Driver 18 for SQL Server**, TLS được bật và thông tin xác thực phù hợp. Mật khẩu chứa ký tự đặc biệt cần được URL-encode. Không dùng `Trusted_Connection=yes` từ ví dụ Windows trong môi trường này. Ví dụ định dạng (thay giá trị và không commit mật khẩu):

   ```text
   mssql+pyodbc://USER:URL_ENCODED_PASSWORD@SERVER.database.windows.net:1433/DATABASE?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=no
   ```

4. Cấu hình truy cập Azure SQL và tài khoản database theo chính sách bảo mật. Ứng dụng hiện chạy `Base.metadata.create_all` khi khởi động: tài khoản cần quyền tương ứng nếu bảng chưa tồn tại. Thao tác này **không** thay thế migration và không cập nhật bảng cũ; cần quản lý thay đổi schema và sao lưu trước khi nâng cấp. Không chạy seed demo trên production.
5. Banner contest đang lưu tại `/app/uploads`. Nếu sử dụng tính năng này, cấu hình Azure Files mount bền vững tại đường dẫn đó và kiểm tra quyền ghi, hoặc chuyển chức năng sang object storage. Không dựa vào filesystem tạm của container; kiểm tra hành vi khi scale nhiều instance.

Tạo Static Web App với nguồn triển khai phù hợp; nếu portal tự sinh workflow, vô hiệu hóa workflow trùng lặp để chỉ pipeline này deploy. Frontend là SPA và `frontend/public/staticwebapp.config.json` cấu hình fallback cho router.

## 2. Kết nối GitHub với Azure bằng OIDC

Tạo GitHub Environment tên chính xác `production` trong **Settings → Environments**. Giới hạn nhánh được phép deploy là `production` và cấu hình required reviewers nếu gói GitHub của nhóm hỗ trợ. Đồng thời bảo vệ nhánh `production`, yêu cầu pull request, review và các job từ hai workflow `Frontend CI` và `Backend CI` (`Frontend checks`, `Backend checks`, `Docker and SQL Server integration`) trước khi merge; giới hạn quyền bypass và push trực tiếp. Chọn tên status check thực tế hiển thị trên pull request khi cấu hình ruleset.

Tạo Microsoft Entra application/service principal hoặc user-assigned identity cho GitHub Actions và thiết lập federated credential:

- Issuer: `https://token.actions.githubusercontent.com`
- Subject: `repo:MocHuy/Scrum-Axon-Algile:environment:production` (thay đúng owner/repository nếu đổi tên hoặc fork).
- Audience: `api://AzureADTokenExchange`.

Cấp quyền tối thiểu theo scope: quyền đẩy image và đọc metadata trên ACR (ví dụ `AcrPush` và `Reader` tại ACR nếu cần), cùng quyền triển khai/cấu hình trên App Service (ví dụ `Website Contributor` tại chính Web App). Quyền để **GitHub đẩy image** khác với quyền `AcrPull` của **managed identity App Service**. Không cấp Contributor toàn subscription nếu không cần.

Trong GitHub Environment `production`, thêm:

| Loại | Tên | Giá trị |
| --- | --- | --- |
| Secret | `AZURE_CLIENT_ID` | Client ID của identity GitHub |
| Secret | `AZURE_TENANT_ID` | Microsoft Entra tenant ID |
| Secret | `AZURE_SUBSCRIPTION_ID` | Azure subscription ID |
| Secret | `AZURE_STATIC_WEB_APPS_API_TOKEN` | Deployment token của Static Web App |
| Variable | `AZURE_ACR_NAME` | Tên ACR, không kèm domain |
| Variable | `AZURE_WEBAPP_NAME` | Tên App Service backend |

Thêm **repository variable** `VITE_API_URL` trong **Settings → Secrets and variables → Actions → Variables** (không đặt riêng trong environment): origin HTTPS backend, ví dụ `https://example.azurewebsites.net`, không có `/` cuối. Job CI cần giá trị này trước khi job deploy truy cập environment. Giá trị được nhúng vào bundle public khi build; tuyệt đối không đưa secrets vào biến `VITE_*`. URL phải trỏ tới đúng App Service triển khai và origin frontend phải có trong `CORS_ORIGINS`. Cấp, lưu và xoay vòng deployment token như một secret.

Sau khi tạo tài nguyên, cấu hình đầy đủ secrets, variables và bảo vệ environment, đặt thêm **repository variable** `ENABLE_AZURE_DEPLOYMENT=true` để bật publish/deploy. Khi biến này chưa có hoặc có giá trị khác `true`, CI vẫn chạy trên `production` nhưng publish/deploy được bỏ qua; frontend artifact của run đó không dùng để phát hành. Sau khi bật, chạy lại `Publish Images` trên `production` để build artifact mới với URL thực tế. Tắt biến để dừng các lần publish mới; thao tác này không hủy job đang chạy.

## 3. Vận hành và xác minh

1. Mở pull request, kiểm tra ba job CI. Sau khi review, merge vào `production`; workflow `Publish Images` chạy lại cả hai CI. Khi đã bật `ENABLE_AZURE_DEPLOYMENT=true`, workflow chờ environment approval ở bước publish và deploy nếu đã cấu hình. Để chạy lại thủ công, chọn workflow `Publish Images` và nhánh `production`.
2. Xem log GitHub Actions và App Service. Kiểm tra URL API, trang frontend, đăng nhập, mở trực tiếp một route SPA, gọi API từ browser và một bài SQL đại diện với dữ liệu được phép kiểm thử.
3. Workflow từ chối deploy run cũ hơn HEAD của `production`. Để khôi phục đồng bộ bằng pipeline, tạo commit revert và deploy commit mới; hoặc thực hiện rollback có kiểm soát theo runbook của nhóm, gồm cả frontend và database. Kiểm tra tính tương thích schema trước khi rollback. Backend và frontend được deploy tuần tự, không phải một giao dịch nguyên tử; lỗi frontend có thể để backend ở phiên bản mới.

Unit test backend dùng SQLite cho import và so sánh kết quả; integration test chạy SQL Server container nhưng chưa kiểm thử sandbox thực thi câu SQL của sinh viên. Trước khi dùng production thực tế, bổ sung test SQL Server/Azure SQL cho chạy và nộp bài, phân quyền, giới hạn sandbox; bổ sung migration có kiểm soát, staging và giám sát/cảnh báo. Các vấn đề nghiệp vụ và bảo mật hiện hữu của ứng dụng không được khắc phục chỉ bằng CI/CD.

Tài liệu tham khảo: [OIDC cho GitHub Actions](https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect), [App Service custom container và managed identity](https://learn.microsoft.com/en-us/azure/app-service/configure-custom-container), [cấu hình Static Web Apps](https://learn.microsoft.com/en-us/azure/static-web-apps/build-configuration), [ODBC Driver trên Linux](https://learn.microsoft.com/en-us/sql/connect/odbc/linux/installing-the-microsoft-odbc-driver-for-sql-server-on-linux).
