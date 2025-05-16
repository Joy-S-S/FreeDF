from flask import Flask, render_template, request, jsonify
import os
from werkzeug.utils import secure_filename
import uuid
from datetime import datetime
import PyPDF2
from io import BytesIO
import img2pdf
import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv
import requests

# تحميل المتغيرات البيئية
load_dotenv()

app = Flask(__name__)

# تكوين Cloudinary
cloudinary.config(
    cloud_name=os.getenv('CLOUDINARY_CLOUD_NAME'),
    api_key=os.getenv('CLOUDINARY_API_KEY'),
    api_secret=os.getenv('CLOUDINARY_API_SECRET')
)

# إعدادات التطبيق
app.config['ALLOWED_EXTENSIONS'] = {'pdf', 'jpg', 'jpeg', 'png'}
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def upload_to_cloudinary(file_data, resource_type="raw"):
    """رفع الملف إلى Cloudinary"""
    try:
        upload_result = cloudinary.uploader.upload(
            file_data,
            resource_type=resource_type,
            format="pdf"
        )
        return upload_result['secure_url'], upload_result['public_id']
    except Exception as e:
        print(f"Cloudinary upload error: {str(e)}")
        raise e

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    if file and allowed_file(file.filename):
        try:
            # قراءة معلومات PDF
            pdf_reader = PyPDF2.PdfReader(file)
            page_count = len(pdf_reader.pages)
            
            # رفع الملف إلى Cloudinary
            file.seek(0)
            url, public_id = upload_to_cloudinary(file)
            
            return jsonify({
                'id': public_id,
                'name': secure_filename(file.filename),
                'url': url,
                'pages': page_count,
                'date': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            })
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    else:
        return jsonify({'error': 'File type not allowed'}), 400

@app.route('/upload-multiple', methods=['POST'])
def upload_multiple_files():
    if 'files[]' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    files = request.files.getlist('files[]')
    uploaded_files = []
    
    for file in files:
        if file and allowed_file(file.filename):
            try:
                pdf_reader = PyPDF2.PdfReader(file)
                page_count = len(pdf_reader.pages)
                file.seek(0)
                url, public_id = upload_to_cloudinary(file)
                
                uploaded_files.append({
                    'id': public_id,
                    'name': secure_filename(file.filename),
                    'url': url,
                    'pages': page_count
                })
            except Exception as e:
                return jsonify({'error': f'Error processing {file.filename}: {str(e)}'}), 500
    
    return jsonify({'files': uploaded_files})

@app.route('/split', methods=['POST'])
def split_pdf():
    data = request.json
    if not data:
        return jsonify({'error': 'Invalid JSON data'}), 400
        
    file_id = data.get('file_id')
    ranges = data.get('ranges')
    
    if not file_id or not ranges:
        return jsonify({'error': 'Missing parameters'}), 400
    
    try:
        # الحصول على الملف من Cloudinary
        resource = cloudinary.api.resource(file_id, resource_type="raw")
        response = requests.get(resource['secure_url'])
        pdf_content = BytesIO(response.content)
        
        results = []
        pdf_reader = PyPDF2.PdfReader(pdf_content)
        
        for i, range_item in enumerate(ranges):
            pdf_writer = PyPDF2.PdfWriter()
            start_page = range_item['start'] - 1
            end_page = range_item['end']
            
            for page_num in range(start_page, end_page):
                if page_num < len(pdf_reader.pages):
                    pdf_writer.add_page(pdf_reader.pages[page_num])
            
            # حفظ الجزء في buffer
            output_buffer = BytesIO()
            pdf_writer.write(output_buffer)
            output_buffer.seek(0)
            
            # رفع الجزء إلى Cloudinary
            url, public_id = upload_to_cloudinary(output_buffer)
            
            results.append({
                'name': f"part_{i+1}.pdf",
                'url': url,
                'public_id': public_id,
                'pages': f"{range_item['start']}-{range_item['end']}"
            })
        
        return jsonify({'parts': results})
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/merge', methods=['POST'])
def merge_pdfs():
    data = request.json
    if not data or 'file_ids' not in data:
        return jsonify({'error': 'Invalid data'}), 400
    
    try:
        pdf_writer = PyPDF2.PdfWriter()
        
        # جمع كل الملفات من Cloudinary
        for file_id in data['file_ids']:
            resource = cloudinary.api.resource(file_id, resource_type="raw")
            response = requests.get(resource['secure_url'])
            pdf_content = BytesIO(response.content)
            pdf_reader = PyPDF2.PdfReader(pdf_content)
            
            for page in pdf_reader.pages:
                pdf_writer.add_page(page)
        
        # حفظ الملف المدمج في buffer
        output_buffer = BytesIO()
        pdf_writer.write(output_buffer)
        output_buffer.seek(0)
        
        # رفع الملف المدمج إلى Cloudinary
        url, public_id = upload_to_cloudinary(output_buffer)
        
        return jsonify({
            'id': public_id,
            'name': 'merged.pdf',
            'url': url,
            'pages': len(pdf_writer.pages)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/remove-pages', methods=['POST'])
def remove_pages():
    data = request.json
    if not data:
        return jsonify({'error': 'Invalid data'}), 400
    
    file_id = data.get('file_id')
    pages_to_remove = data.get('pages')
    
    if not file_id or not pages_to_remove:
        return jsonify({'error': 'Missing parameters'}), 400
    
    try:
        # الحصول على الملف من Cloudinary
        resource = cloudinary.api.resource(file_id, resource_type="raw")
        response = requests.get(resource['secure_url'])
        pdf_content = BytesIO(response.content)
        
        pdf_reader = PyPDF2.PdfReader(pdf_content)
        pdf_writer = PyPDF2.PdfWriter()
        
        # إضافة جميع الصفحات ما عدا المحددة للحذف
        for page_num in range(len(pdf_reader.pages)):
            if (page_num + 1) not in pages_to_remove:
                pdf_writer.add_page(pdf_reader.pages[page_num])
        
        # حفظ الملف الجديد في buffer
        output_buffer = BytesIO()
        pdf_writer.write(output_buffer)
        output_buffer.seek(0)
        
        # رفع الملف إلى Cloudinary
        url, public_id = upload_to_cloudinary(output_buffer)
        
        return jsonify({
            'id': public_id,
            'name': 'pages_removed.pdf',
            'url': url,
            'pages': len(pdf_writer.pages)
        })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/scan-to-pdf', methods=['POST'])
def scan_to_pdf():
    if 'images[]' not in request.files:
        return jsonify({'error': 'No images uploaded'}), 400
    
    images = request.files.getlist('images[]')
    if not images:
        return jsonify({'error': 'No images provided'}), 400

    try:
        # تحويل الصور إلى PDF
        pdf_data = img2pdf.convert([image.read() for image in images])
        pdf_buffer = BytesIO(pdf_data)
        
        # رفع الملف إلى Cloudinary
        url, public_id = upload_to_cloudinary(pdf_buffer)
        
        return jsonify({
            'id': public_id,
            'name': 'scanned.pdf',
            'url': url,
            'pages': len(images)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/download/<public_id>')
def download_file(public_id):
    try:
        resource = cloudinary.api.resource(public_id, resource_type="raw")
        return jsonify({'url': resource['secure_url']})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)