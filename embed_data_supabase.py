# -*- coding: utf-8 -*-
import os
import sys
import time
import openpyxl
import google.generativeai as genai
from supabase import create_client, Client

# Configure terminal to output Vietnamese text correctly
sys.stdout.reconfigure(encoding='utf-8')

# ==================== CONFIGURATION ====================
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "YOUR_GEMINI_API_KEY")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "YOUR_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "YOUR_SUPABASE_KEY")
TABLE_NAME = "documents"

def check_config():
    if not GEMINI_API_KEY or "YOUR_GEMINI" in GEMINI_API_KEY:
        print("Cảnh báo: Chưa cấu hình GEMINI_API_KEY. Vui lòng lấy key tại: https://aistudio.google.com/")
    if not SUPABASE_URL or "YOUR_SUPABASE" in SUPABASE_URL:
        print("Cảnh báo: Chưa cấu hình SUPABASE_URL. Vui lòng lấy trong settings của dự án Supabase.")
    if not SUPABASE_KEY or "YOUR_SUPABASE" in SUPABASE_KEY:
        print("Cảnh báo: Chưa cấu hình SUPABASE_KEY (anon hoặc service_role).")

def get_gemini_embedding(text):
    # Sử dụng model nhúng hoạt động ổn định (768 chiều để đồng bộ với n8n và database)
    response = genai.embed_content(
        model="models/gemini-embedding-001",
        content=text,
        task_type="retrieval_document"
    )
    return response['embedding']

def load_data_from_excel(file_path):
    print(f"Đang đọc dữ liệu từ file Excel: {file_path}...")
    wb = openpyxl.load_workbook(file_path)
    documents = []
    
    # 1. Đọc Catalog sản phẩm
    if "Catalog" in wb.sheetnames:
        ws_catalog = wb["Catalog"]
        for row in range(2, ws_catalog.max_row + 1):
            sku = ws_catalog.cell(row=row, column=1).value
            name = ws_catalog.cell(row=row, column=2).value
            category = ws_catalog.cell(row=row, column=3).value
            price = ws_catalog.cell(row=row, column=4).value
            promo_price = ws_catalog.cell(row=row, column=5).value
            colors = ws_catalog.cell(row=row, column=6).value
            sizes = ws_catalog.cell(row=row, column=7).value
            material = ws_catalog.cell(row=row, column=8).value
            desc = ws_catalog.cell(row=row, column=9).value
            stock = ws_catalog.cell(row=row, column=10).value
            image = ws_catalog.cell(row=row, column=11).value
            
            if not sku:
                continue
                
            content = (
                f"Sản phẩm: {name} (Mã sản phẩm: {sku})\n"
                f"Phân loại: {category}\n"
                f"Giá niêm yết: {price:,} VND - Giá khuyến mãi: {promo_price:,} VND\n"
                f"Màu sắc: {colors}\n"
                f"Size khả dụng: {sizes}\n"
                f"Chất liệu: {material}\n"
                f"Mô tả: {desc}\n"
                f"Tồn kho: {stock} sản phẩm"
            )
            
            metadata = {
                "type": "product",
                "sku": sku,
                "name": name,
                "category": category,
                "price": price,
                "promo_price": promo_price,
                "colors": colors,
                "sizes": sizes,
                "material": material,
                "description": desc,
                "stock": stock,
                "image_url": image
            }
            
            documents.append((content, metadata))
            
        print(f"-> Đã tải {ws_catalog.max_row - 1} sản phẩm từ tab Catalog.")
    else:
        print("Lỗi: Không tìm thấy tab 'Catalog' trong file Excel.")
        
    # 2. Đọc Shop Policies
    if "ShopPolicies" in wb.sheetnames:
        ws_policy = wb["ShopPolicies"]
        for row in range(2, ws_policy.max_row + 1):
            policy_id = ws_policy.cell(row=row, column=1).value
            topic = ws_policy.cell(row=row, column=2).value
            question = ws_policy.cell(row=row, column=3).value
            answer = ws_policy.cell(row=row, column=4).value
            
            if not policy_id:
                continue
                
            content = (
                f"Chủ đề chính sách: {topic}\n"
                f"Câu hỏi: {question}\n"
                f"Trả lời: {answer}"
            )
            
            metadata = {
                "type": "policy",
                "policy_id": policy_id,
                "topic": topic,
                "question": question,
                "answer": answer
            }
            
            documents.append((content, metadata))
            
        print(f"-> Đã tải {ws_policy.max_row - 1} câu hỏi chính sách từ tab ShopPolicies.")
    else:
        print("Lỗi: Không tìm thấy tab 'ShopPolicies' trong file Excel.")
        
    return documents

def upload_to_supabase(documents):
    if not SUPABASE_URL or SUPABASE_URL == "YOUR_SUPABASE_URL":
        print("Lỗi: Chưa điền SUPABASE_URL.")
        return
    if not SUPABASE_KEY or SUPABASE_KEY == "YOUR_SUPABASE_KEY":
        print("Lỗi: Chưa điền SUPABASE_KEY.")
        return
        
    print(f"Khởi tạo kết nối tới Supabase tại: {SUPABASE_URL}...")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # Cấu hình API Key cho Google Gemini
    genai.configure(api_key=GEMINI_API_KEY)
    
    print("Đang xóa dữ liệu cũ trong bảng documents trên Supabase (nếu có)...")
    try:
        # Xóa tất cả các bản ghi trước khi nạp mới (để tránh trùng lặp dữ liệu)
        supabase.table(TABLE_NAME).delete().neq("id", 0).execute()
        print("-> Đã xóa sạch dữ liệu cũ.")
    except Exception as e:
        print(f"Không thể xóa dữ liệu cũ (có thể bảng trống hoặc chưa tạo bảng): {e}")

    print("Đang tiến hành sinh vector embeddings từ Gemini và đẩy lên Supabase...")
    
    batch_size = 10
    batch_data = []
    
    for idx, (content, metadata) in enumerate(documents):
        try:
            # Gọi API của Google Gemini để lấy embedding 768 chiều
            vector = get_gemini_embedding(content)
            
            # Thêm độ trễ để tránh vượt giới hạn Rate Limit của tài khoản Gemini miễn phí (100 lượt/phút)
            time.sleep(0.7)
            
            record = {
                "content": content,
                "metadata": metadata,
                "embedding": vector
            }
            
            batch_data.append(record)
            
            # Đẩy dữ liệu theo từng cụm (batch) 10 bản ghi để tối ưu hiệu năng
            if len(batch_data) == batch_size or idx == len(documents) - 1:
                supabase.table(TABLE_NAME).insert(batch_data).execute()
                print(f"   Đã nhúng & tải lên {idx + 1}/{len(documents)} bản ghi...")
                batch_data = []
                
        except Exception as e:
            print(f"Lỗi tại bản ghi thứ {idx+1}: {e}")
            return
            
    print("Hoàn tất! Toàn bộ dữ liệu của Velura đã được đẩy lên Supabase Vector DB thành công!")

if __name__ == "__main__":
    check_config()
    
    excel_path = "data_chatbot.xlsx"
    if not os.path.exists(excel_path):
        # Kiểm tra ở thư mục cha nếu chạy từ thư mục con
        if os.path.exists("../data_chatbot.xlsx"):
            excel_path = "../data_chatbot.xlsx"
        else:
            print(f"Lỗi: Không tìm thấy file '{excel_path}' trong thư mục.")
            sys.exit(1)
            
    documents = load_data_from_excel(excel_path)
    
    if (GEMINI_API_KEY != "YOUR_GEMINI_API_KEY" and 
        SUPABASE_URL != "YOUR_SUPABASE_URL" and 
        SUPABASE_KEY != "YOUR_SUPABASE_KEY"):
        upload_to_supabase(documents)
    else:
        print("\nHướng dẫn chạy:")
        print("1. Điền các khóa API vào file 'embed_data_supabase.py'")
        print("2. Chạy lệnh: python embed_data_supabase.py")
