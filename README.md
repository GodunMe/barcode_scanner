# SPM Barcode App

Ứng dụng quét mã vạch với giao diện admin và backend.

## Cấu trúc dự án

```
├── src/                    # Mã nguồn backend
│   ├── server.js          # Express server chính
│   └── db.js              # Database layer (lowdb)
├── public/                # Frontend assets
│   ├── index.html         # Trang chính (quét mã vạch)
│   ├── js/
│   │   └── app.js         # Logic quét mã vạch
│   ├── admin/             # Giao diện admin
│   │   ├── index.html     # Trang admin
│   │   └── admin.js       # Logic admin
│   └── uploads/           # File uploads
├── config/                # Cấu hình
│   └── database.js        # Cấu hình database
├── scripts/               # Tiện ích
│   ├── migrate.js         # Migration script
│   ├── reset_admin.js     # Reset admin password
│   └── cleanup_uploads.js # Dọn dẹp uploads
├── db.json               # Database file
└── package.json          # Dependencies
```

## Cài đặt

```bash
npm install
npm start
```

## Truy cập

- Trang chính: http://localhost:3000
- Admin: http://localhost:3000/admin (admin/admin123)

## Tính năng

- Quét mã vạch bằng camera
- Hai chế độ: kiểm tra giá và giỏ hàng
- Giao diện admin quản lý sản phẩm
- Upload và nén ảnh tự động
- Pagination và tìm kiếm

## API Endpoints

- `GET /api/products` - Danh sách sản phẩm
- `POST /api/products` - Tạo sản phẩm (cần auth)
- `PUT /api/products/:id` - Cập nhật sản phẩm (cần auth)
- `DELETE /api/products/:id` - Xóa sản phẩm (cần auth)
- `POST /api/uploads` - Upload ảnh (cần auth)