import os
import io
import zipfile
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from PIL import Image
import smtplib
import uuid
from concurrent.futures import ProcessPoolExecutor
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email import encoders # encode_base64 のために残す
import threading
import datetime
from datetime import date
import time
import traceback # エラー詳細表示用
from dotenv import load_dotenv # .envファイル読み込み用
import mysql.connector
from mysql.connector import Error
from email.utils import encode_rfc2231 # ★ encode_rfc2231 は email.utils にあります

load_dotenv() # .env ファイルから環境変数を読み込む

app = Flask(__name__)
CORS(app, expose_headers=['Content-Disposition'])

GMAIL_USER = os.environ.get('GMAIL_USER')
GMAIL_APP_PASSWORD = os.environ.get('GMAIL_APP_PASSWORD')

DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_USER = os.environ.get('DB_USER')
DB_PASSWORD = os.environ.get('DB_PASSWORD')
DB_NAME = os.environ.get('DB_NAME', 'image_compressor_stats')


executor = ProcessPoolExecutor(max_workers=os.cpu_count() or 2)
tasks = {}
tasks_lock = threading.Lock()

TASK_TIMEOUT_SECONDS = 300
MAX_IMAGE_DIMENSION = 1600

def get_db_connection():
    """MySQLデータベースへの接続を取得します。"""
    if not DB_USER or not DB_PASSWORD:
        print("エラー: DB_USER または DB_PASSWORD が環境変数に設定されていません。")
        return None
    try:
        conn = mysql.connector.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )
        if conn.is_connected():
            print(f"MySQLデータベース ({DB_NAME}) に接続しました。")
            return conn
    except Error as e:
        print(f"MySQLデータベースへの接続エラー: {e}")
        traceback.print_exc()
        return None
    return None


def compress_image_data(image_bytes_io, original_filename_for_format_hint, output_quality=35, max_size_kb=None):
    try:
        print(f"[compress_image_data] Processing: {original_filename_for_format_hint}")
        img = Image.open(image_bytes_io)
        print(f"[compress_image_data] Opened: {original_filename_for_format_hint}, format: {img.format}, mode: {img.mode}, size: {img.size}, original_ext_hint: {os.path.splitext(original_filename_for_format_hint)[1]}")
        _, ext = os.path.splitext(original_filename_for_format_hint)
        original_format = img.format or ext[1:].upper()

        if img.width > MAX_IMAGE_DIMENSION or img.height > MAX_IMAGE_DIMENSION:
            print(f"[compress_image_data] Resizing image: {original_filename_for_format_hint} from {img.width}x{img.height} (MAX: {MAX_IMAGE_DIMENSION})")
            img.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), Image.Resampling.LANCZOS)
            print(f"[compress_image_data] Resized: {original_filename_for_format_hint} to {img.width}x{img.height}")

        if img.mode == 'RGBA' and original_format != 'PNG':
            img = img.convert('RGB')
        
        img_byte_arr = io.BytesIO()
        if original_format == 'PNG':
            print(f"[compress_image_data] Saving as PNG: {original_filename_for_format_hint}")
            img.save(img_byte_arr, format='PNG', optimize=True)
        elif original_format == 'GIF':
            print(f"[compress_image_data] Passing through GIF: {original_filename_for_format_hint}")
            image_bytes_io.seek(0)
            img_byte_arr.write(image_bytes_io.read())
        elif original_format == 'WEBP':
            print(f"[compress_image_data] Saving as WEBP (quality: {output_quality}): {original_filename_for_format_hint}")
            img.save(img_byte_arr, format='WEBP', quality=output_quality)
        else: # JPEGなど
            print(f"[compress_image_data] Saving as JPEG (quality: {output_quality}): {original_filename_for_format_hint}")
            img.save(img_byte_arr, format='JPEG', quality=output_quality, optimize=True)
        
        img_byte_arr.seek(0)
        compressed_size = len(img_byte_arr.getvalue())
        if max_size_kb and (compressed_size / 1024 > max_size_kb) and original_format not in ['GIF', 'PNG']:
            print(f"[compress_image_data] Image {original_filename_for_format_hint} ({compressed_size / 1024:.2f}KB) exceeds max_size_kb ({max_size_kb}KB). Re-compressing with lower quality.")
            lower_quality = max(10, output_quality - 15)
            img_byte_arr.seek(0)
            img_byte_arr.truncate(0)
            if original_format == 'WEBP':
                print(f"[compress_image_data] Re-saving as WEBP (quality: {lower_quality}): {original_filename_for_format_hint}")
                img.save(img_byte_arr, format='WEBP', quality=lower_quality)
            else:
                print(f"[compress_image_data] Re-saving as JPEG (quality: {lower_quality}): {original_filename_for_format_hint}")
                img.save(img_byte_arr, format='JPEG', quality=lower_quality, optimize=True)
            img_byte_arr.seek(0)
        
        print(f"[compress_image_data] Successfully compressed: {original_filename_for_format_hint}")
        return img_byte_arr.getvalue()
    except Exception as e:
        print(f"[compress_image_data] Error compressing {original_filename_for_format_hint}: {e}")
        traceback.print_exc()
        return None

def _compress_images_task(task_id, image_files_content_list):
    print(f"[_compress_images_task] Task {task_id} started for {len(image_files_content_list)} images with default settings.")
    try:
        compressed_files_result_data = []
        for filename, file_bytes in image_files_content_list:
            image_bytes_io = io.BytesIO(file_bytes)
            compressed_image_bytes = compress_image_data(image_bytes_io, filename, output_quality=35)
            print(f"[_compress_images_task] Task {task_id} - Processed {filename}, result bytes: {len(compressed_image_bytes) if compressed_image_bytes else 'None'}")
            if compressed_image_bytes:
                compressed_files_result_data.append({
                    'filename': filename,
                    'data': compressed_image_bytes
                })
        if not compressed_files_result_data:
            print(f"[_compress_images_task] Task {task_id} - No compressible images found.")
            return {"status": "error", "error_message": "圧縮できる画像がありませんでした。"}

        print(f"[_compress_images_task] Task {task_id} completed successfully.")
        return {"status": "completed", "result": {"files": compressed_files_result_data}}
    except Exception as e:
        print(f"[_compress_images_task] Task {task_id} - Exception: {e}")
        traceback.print_exc()
        return {"status": "error", "error_message": str(e)}

def _update_task_status_from_future(task_id, future):
    print(f"[_update_task_status_from_future] Updating status for task {task_id}")
    try:
        result_data = future.result() 
        with tasks_lock:
            if task_id in tasks:
                tasks[task_id].update(result_data)
            else:
                print(f"[_update_task_status_from_future] Task {task_id} not found in tasks dict, might have been reset.")
                return
        print(f"[_update_task_status_from_future] Task {task_id} updated with result: {result_data.get('status')}")
    except Exception as e:
        print(f"[_update_task_status_from_future] Error updating task {task_id}: {e}")
        traceback.print_exc()
        with tasks_lock:
            if task_id in tasks:
                tasks[task_id]["status"] = "error"
                tasks[task_id]["error_message"] = f"Failed to get task result: {str(e)}"

@app.route('/compress-images', methods=['POST'])
def compress_images_route():
    image_files = request.files.getlist('images')
    if not image_files:
        return jsonify({"error": "画像ファイルが選択されていません。"}), 400

    print(f"[/compress-images] Using default compression settings.")

    print(f"[/compress-images] Received {len(image_files)} files for compression.")
    task_id = str(uuid.uuid4())
    with tasks_lock:
        tasks[task_id] = {"status": "processing", "start_time": time.time()}

    image_files_content_list_for_process = []
    for image_file in image_files:
        file_content = image_file.read()
        image_files_content_list_for_process.append((image_file.filename, file_content))

    future = executor.submit(_compress_images_task, task_id, image_files_content_list_for_process)
    future.add_done_callback(lambda f: _update_task_status_from_future(task_id, f))

    print(f"[/compress-images] Task {task_id} submitted for compression.")
    return jsonify({"message": "画像圧縮処理を受け付けました。", "task_id": task_id}), 202

def _send_email_task(task_id, email_address, zip_file_bytes, zip_filename):
    print(f"[_send_email_task] Task {task_id} started for email to {email_address} with filename: {zip_filename}")
    try:
        if not GMAIL_USER or not GMAIL_APP_PASSWORD:
            print("Error: GMAIL_USER or GMAIL_APP_PASSWORD not set in environment variables for _send_email_task.")
            return {"status": "error", "error_message": "Gmailの認証情報がサーバーに設定されていません."}

        msg = MIMEMultipart()
        msg['From'] = GMAIL_USER
        msg['To'] = email_address
        msg['Subject'] = "圧縮された画像ファイルをお届けします"
        body = "Image Compression Machineをご利用いただきありがとうございます。\n\n圧縮された画像ファイルを添付しましたのでご確認ください。"
        msg.attach(MIMEText(body, 'plain'))

        part = MIMEBase('application', 'octet-stream')
        part.set_payload(zip_file_bytes)
        encoders.encode_base64(part)
        
        # RFC 2231形式でファイル名をエンコードして filename* パラメータを追加
        # これにより、日本語のような非ASCII文字を含むファイル名が正しく扱われやすくなる
        # emailライブラリのadd_headerに任せることで、適切なエンコーディングを期待する
        part.add_header('Content-Disposition', 'attachment', filename=zip_filename)
        msg.attach(part)

        server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
        server.ehlo()
        server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
        server.sendmail(GMAIL_USER, email_address, msg.as_string())
        server.close()
        print(f"[_send_email_task] Task {task_id} email sent successfully to {email_address}.")
        return {"status": "completed", "result": {"message": f"{email_address} へのメール送信が完了しました。"}}
    except Exception as e:
        print(f"[_send_email_task] Task {task_id} - Exception: {e}")
        traceback.print_exc()
        return {"status": "error", "error_message": str(e)}

def _update_email_task_status_from_future(task_id, future):
    print(f"[_update_email_task_status_from_future] Updating status for email task {task_id}")
    try:
        result_data = future.result()
        with tasks_lock:
            if task_id in tasks:
                tasks[task_id].update(result_data)
            else:
                print(f"[_update_email_task_status_from_future] Email task {task_id} not found, might have been reset.")
                return
        print(f"[_update_email_task_status_from_future] Email task {task_id} updated with result: {result_data.get('status')}")
    except Exception as e:
        print(f"[_update_email_task_status_from_future] Error updating email task {task_id}: {e}")
        traceback.print_exc()
        with tasks_lock:
            if task_id in tasks:
                tasks[task_id]["status"] = "error"
                tasks[task_id]["error_message"] = f"Failed to get email task result: {str(e)}"

@app.route('/send-zip-email', methods=['POST'])
def send_zip_email_route():
    email_address = request.form.get('email_address')
    if not email_address:
        return jsonify({"error": "メールアドレスが指定されていません。"}), 400
    if 'zip_file' not in request.files:
        return jsonify({"error": "ZIPファイルが添付されていません。"}), 400
    
    zip_file_obj = request.files['zip_file']
    zip_file_bytes = zip_file_obj.read()
    
    # フロントエンドから送信されたファイル名を取得
    zip_filename_from_request = zip_file_obj.filename
    if not zip_filename_from_request: # ファイル名が空の場合のフォールバック
        print("[/send-zip-email] Warning: Filename not received from client, using default 'compressed_images.zip'.")
        zip_filename_from_request = "compressed_images.zip"
    
    print(f"[/send-zip-email] Received email request for {email_address}, zip_filename from client: {zip_filename_from_request}")

    task_id = str(uuid.uuid4())
    with tasks_lock:
        tasks[task_id] = {"status": "processing", "start_time": time.time()}

    future = executor.submit(_send_email_task, task_id, email_address, zip_file_bytes, zip_filename_from_request)
    future.add_done_callback(lambda f: _update_email_task_status_from_future(task_id, f))

    return jsonify({"message": "メール送信処理を受け付けました。", "task_id": task_id}), 202

@app.route('/record-access', methods=['POST'])
def record_access_route():
    """今日のアクセスを記録します。"""
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "データベース接続に失敗しました。"}), 500

    cursor = None
    try:
        cursor = conn.cursor()
        today_str = date.today().isoformat()

        cursor.execute("SELECT visit_count FROM daily_visits WHERE visit_date = %s", (today_str,))
        result = cursor.fetchone()

        if result:
            new_count = result[0] + 1
            cursor.execute("UPDATE daily_visits SET visit_count = %s WHERE visit_date = %s", (new_count, today_str))
            print(f"今日の訪問者数を更新しました: {new_count} ({today_str})")
        else:
            cursor.execute("INSERT INTO daily_visits (visit_date, visit_count) VALUES (%s, %s)", (today_str, 1))
            print(f"今日の最初の訪問者を記録しました。 ({today_str})")
        
        conn.commit()
        return jsonify({"message": "アクセスが記録されました。"}), 200
    except Error as e:
        if conn:
            conn.rollback()
        print(f"[/record-access] エラー: {e}")
        traceback.print_exc()
        return jsonify({"error": "アクセス記録に失敗しました。"}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()
            # print("MySQL接続を閉じました。(/record-access)") # 頻繁なのでコメントアウト

@app.route('/daily-stats', methods=['GET'])
def get_daily_stats_route():
    """日毎の訪問者数を取得します。"""
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "データベース接続に失敗しました。"}), 500

    cursor = None
    try:
        cursor = conn.cursor(dictionary=True) 
        cursor.execute("SELECT visit_date, visit_count FROM daily_visits ORDER BY visit_date ASC")
        stats = cursor.fetchall()
        
        formatted_stats = []
        for row in stats:
            visit_date_iso = row['visit_date'].isoformat() if isinstance(row['visit_date'], date) else str(row['visit_date'])
            formatted_stats.append({
                "date": visit_date_iso, # フロントエンドの期待するキー名 "date"
                "count": row['visit_count'] # フロントエンドの期待するキー名 "count"
            })
        print(f"日毎の統計データを取得しました: {len(formatted_stats)}件")
        return jsonify(formatted_stats), 200
    except Error as e:
        print(f"[/daily-stats] エラー: {e}")
        traceback.print_exc()
        return jsonify({"error": "日毎の統計データ取得に失敗しました。"}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()
            # print("MySQL接続を閉じました。(/daily-stats)") # 頻繁なのでコメントアウト


@app.route('/task-status/<task_id>', methods=['GET'])
def task_status_route(task_id):
    with tasks_lock:
        task = tasks.get(task_id)

    if not task:
        return jsonify({"error": "指定されたタスクIDが見つかりません。"}), 404

    if task["status"] in ["pending", "processing"] and (time.time() - task.get("start_time", time.time())) > TASK_TIMEOUT_SECONDS:
        with tasks_lock:
            if task_id in tasks and tasks[task_id]["status"] in ["pending", "processing"]:
                tasks[task_id]["status"] = "error"
                tasks[task_id]["error_message"] = "タスクがタイムアウトしました。"
        task = tasks.get(task_id) 

    if task["status"] == "completed":
        if "result" in task and isinstance(task["result"], dict) and "files" in task["result"]:
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file_obj:
                for item in task["result"]["files"]:
                    zip_file_obj.writestr(item['filename'], item['data'])
            zip_buffer.seek(0)
            now = datetime.datetime.now()
            date_str = now.strftime("%Y-%m-%d")
            time_str = now.strftime("%H%M%S")
            download_filename = f"圧縮画像_{date_str}_{time_str}.zip"
            print(f"DEBUG: Sending file with download_name: {download_filename}")
            return send_file(zip_buffer, as_attachment=True, download_name=download_filename, mimetype='application/zip')
        elif "result" in task and isinstance(task["result"], dict) and "message" in task["result"]: 
             return jsonify({"status": task["status"], "message": task["result"]["message"]})
        else: 
            print(f"Task {task_id} completed but result format is unexpected: {task.get('result')}")
            return jsonify({"status": task["status"], "result": task.get("result")})
    elif task["status"] == "error":
        return jsonify({"status": task["status"], "error": task.get("error_message", "不明なエラー")}), 500
    else: 
        return jsonify({"status": task["status"]}), 200

if __name__ == '__main__':
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        print("警告: GMAIL_USER または GMAIL_APP_PASSWORD が環境変数に設定されていません。メール送信機能は動作しません。")
    if not DB_USER or not DB_PASSWORD:
        print("警告: DB_USER または DB_PASSWORD が環境変数に設定されていません。データベース機能は動作しません。")
        print(f"現在の設定: DB_USER='{DB_USER}', DB_PASSWORD='{'設定済み' if DB_PASSWORD else '未設定'}'")

    conn_check = get_db_connection()
    if conn_check:
        try:
            cursor = conn_check.cursor()
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
            conn_check.commit() 
            cursor.execute(f"USE {DB_NAME};") 
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS daily_visits (
                    visit_date DATE PRIMARY KEY,
                    visit_count INT DEFAULT 0
                );
            """)
            conn_check.commit()
            print(f"データベース '{DB_NAME}' とテーブル 'daily_visits' の準備ができました。")
            cursor.close()
        except Error as e:
            print(f"データベース/テーブルの初期化中にエラーが発生しました: {e}")
        finally:
            if conn_check.is_connected():
                conn_check.close()
    else:
        print("データベース接続がないため、データベース/テーブルの初期化をスキップします。")

    app.run(debug=True, port=5001)
