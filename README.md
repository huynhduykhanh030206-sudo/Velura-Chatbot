# 🌸 Velura Fashion AI Stylist Chatbot (Multi-Agent RAG System)

Dự án này là hệ thống Chatbot AI tư vấn thời trang chuyên nghiệp cho thương hiệu **Velura**, được tối ưu hóa cho mục đích học tập và báo cáo môn học AI. Hệ thống sử dụng kiến trúc **Multi-Agent** thông minh, kết hợp mô hình **Groq (Llama 3.3)** và **Supabase Vector Database** để mang lại hiệu năng cao, tốc độ phản hồi nhanh, và hoàn toàn miễn phí.

---

## 📂 Cấu trúc thư mục dự án

```text
velura-chatbot/
├── web_chat/
│   ├── index.html        # Giao diện chính của trang chatbot Velura (đã loại bỏ guest/user mode, chat trực tiếp)
│   ├── style.css         # Thiết kế CSS Glassmorphism theo tone màu sang trọng của Velura
│   └── app.js            # Lập trình kết nối API n8n, hiển thị ảnh trực tiếp trong khung chat và chế độ fallback offline
├── data_chatbot.xlsx     # File Excel nguồn chứa 100+ dòng dữ liệu sản phẩm (Catalog) và chính sách (Policies) chuẩn
├── embed_data_supabase.py# Script Python đẩy dữ liệu từ Excel lên cơ sở dữ liệu Supabase
├── requirements.txt      # Khai báo các thư viện Python cần thiết để chạy script nhúng
├── workflow_chatbot_supabase.json # File cấu hình n8n Workflow 1-Agent (Cơ bản)
├── workflow_chatbot_supabase_multi_agent.json # File cấu hình n8n Multi-Agent (Gemini-only)
└── workflow_chatbot_supabase_multi_agent_groq.json # File cấu hình n8n Multi-Agent nâng cao (Groq Llama 3.3 - Khuyên dùng)
```

---

## 🛠️ Hướng dẫn cài đặt chi tiết

### Bước 1: Khởi tạo Vector Database trên Supabase (Miễn phí)

1. Truy cập [Supabase](https://supabase.com) và đăng nhập bằng tài khoản Github của bạn.
2. Tạo một **New Project** mới và đợi hệ thống thiết lập cơ sở dữ liệu.
3. Ở menu bên trái, truy cập vào mục **SQL Editor** -> chọn **New query**.
4. Dán đoạn mã SQL sau và click **Run** để kích hoạt extension vector và tạo bảng tri thức:

```sql
-- 1. Kích hoạt extension pgvector hỗ trợ tìm kiếm vector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tạo bảng documents lưu trữ tài liệu
CREATE TABLE documents (
  id bigint primary key generated always as identity,
  content text,
  metadata jsonb,
  embedding vector(768) -- Vector 768 chiều tương thích với Gemini Embeddings
);

-- 3. Tạo hàm tìm kiếm tương đồng Cosine (match_documents) bắt buộc cho n8n
create or replace function match_documents (
  query_embedding vector(768),
  match_count int default null,
  filter jsonb default '{}'
) returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where documents.metadata @> filter
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;
```

5. Vào **Project Settings** (biểu tượng bánh răng) -> Chọn mục **API**:
   - Copy **Project URL** (sử dụng làm `SUPABASE_URL`).
   - Copy **Project API Key** (dòng `service_role` hoặc `anon public` để làm `SUPABASE_KEY`).

---

### Bước 2: Lấy API Keys (Miễn phí)

1. **Google Gemini API Key**:
   - Truy cập [Google AI Studio](https://aistudio.google.com/).
   - Click vào nút **Get API Key** -> Chọn **Create API key** và sao chép mã khóa.
2. **Groq API Key**:
   - Truy cập [Groq Console](https://console.groq.com/).
   - Tạo một tài khoản miễn phí và truy cập mục **API Keys** -> click **Create API Key** để lấy khóa kết nối.

---

### Bước 3: Nạp dữ liệu sản phẩm lên Supabase

> [!IMPORTANT]
> Luôn sử dụng tệp Excel nguồn nằm bên trong thư mục `velura-chatbot/data_chatbot.xlsx` để nạp dữ liệu. Tránh dùng các tệp trùng tên nằm ngoài thư mục gốc để đảm bảo tính đồng bộ của dữ liệu (mã SKU, giá bán, số lượng tồn kho).

1. Mở Terminal tại thư mục `velura-chatbot/`.
2. Cài đặt các thư viện Python:
   ```bash
   pip install -r requirements.txt
   ```
3. Mở file `embed_data_supabase.py` và điền các khóa thông tin kết nối:
   ```python
   GEMINI_API_KEY = "Điền_Key_Gemini_Vào_Đây"
   SUPABASE_URL = "Điền_Supabase_URL_Vào_Đây"
   SUPABASE_KEY = "Điền_Supabase_Key_Vào_Đây"
   ```
4. Chạy script để nhúng và nạp dữ liệu lên Supabase:
   ```bash
   python embed_data_supabase.py
   ```

---

### Bước 4: Import và Cấu hình n8n Workflow

1. Mở giao diện n8n cục bộ của bạn (thường là `http://localhost:5678`).
2. Chọn biểu tượng menu ở góc trên bên phải -> Chọn **Import from file...** và chọn tệp **`workflow_chatbot_supabase_multi_agent_groq.json`**.
3. Cấu hình Credentials cho các node trong workflow vừa import:
   - **Google Gemini Embeddings**: Chọn kết nối, dán `GEMINI_API_KEY`.
   - **Groq Chat Model** (Các node model kết nối với Router và Sub-Agents): Dán `GROQ_API_KEY` của bạn.
   - **Supabase Vector Store** (Tại các node `tim_san_pham`, `tim_gia`, `tim_chinh_sach`): Nhập thông tin Database Host, Name, User, Password lấy từ **Project Settings -> Database** trên Supabase.
   - **Log to Google Sheets**: Liên kết tài khoản Google của bạn và chọn tệp Sheets chứa trang tính `Ticket_Log`.
4. Bật chế độ hoạt động cho workflow bằng cách gạt nút **Active** ở góc trên bên phải n8n sang màu xanh.

---

### Bước 5: Chạy thử Giao diện Web Chat

1. Trên n8n, copy địa chỉ **Production URL** của Webhook (ví dụ: `https://ten_mien_cua_ban.app.n8n.cloud/webhook/velura-chat`).
2. Mở tệp `web_chat/app.js` và cập nhật URL webhook ở dòng 11:
   ```javascript
   const N8N_WEBHOOK_URL = 'Địa_Chỉ_Webhook_Production_Vừa_Copy';
   ```
3. Mở tệp `web_chat/index.html` trực tiếp trên trình duyệt của bạn để trải nghiệm chat.

---

## 💡 Các kịch bản kiểm thử mẫu (UAT Demo)

*   **Tư vấn sản phẩm động (RAG):** *\"Shop có mẫu sơ mi nào đẹp không?\"*
    - *AI Stylist sẽ gọi tool `tim_san_pham` tra cứu Supabase và phản hồi kèm theo thẻ hình ảnh hiển thị ngay bên trong bong bóng chat của bot.*
*   **Báo giá sản phẩm:** *\"Mã TS001 giá bao nhiêu vậy em?\"*
    - *Agent Báo Giá sẽ tra cứu database và đưa ra thông tin giá niêm yết (450k) và giá khuyến mãi (360k).*
*   **Tư vấn chọn size:** *\"Mình cao 1m72 nặng 65kg muốn mua sơ mi\"*
    - *Agent Tính Size sẽ tự động truyền các tham số vào công cụ JS để đưa ra khuyến nghị size chuẩn xác nhất.*
*   **Chế độ UAT Fallback (Ngoại tuyến):** Nếu n8n webhook offline hoặc lỗi kết nối, frontend `app.js` tích hợp sẵn logic fallback thông minh, giúp tự động nhận diện SKU và phản hồi thông tin sản phẩm mẫu cùng hình ảnh minh họa ngay lập tức mà không làm đứt gãy trải nghiệm người dùng.
