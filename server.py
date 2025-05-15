from flask import Flask, render_template, request, jsonify, send_from_directory
import os
from werkzeug.utils import secure_filename
import uuid
from datetime import datetime
import PyPDF2
from io import BytesIO
import img2pdf

app = Flask(__name__)

# إعدادات التطبيق
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['ALLOWED_EXTENSIONS'] = {'pdf'}
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB

# إنشاء مجلد التحميلات إذا لم يكن موجودًا
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

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
            # قراءة ملف PDF لمعرفة عدد الصفحات
            pdf_reader = PyPDF2.PdfReader(file)
            page_count = len(pdf_reader.pages)
            
            # حفظ الملف مؤقتًا
            file.seek(0)
            filename = secure_filename(file.filename)
            unique_id = str(uuid.uuid4())
            new_filename = f"{unique_id}_{filename}"
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], new_filename)
            file.save(file_path)
            
            return jsonify({
                'id': unique_id,
                'name': filename,
                'size': os.path.getsize(file_path),
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
    if not files or files[0].filename == '':
        return jsonify({'error': 'No selected files'}), 400
    
    uploaded_files = []
    
    for file in files:
        if file and allowed_file(file.filename):
            try:
                # قراءة ملف PDF لمعرفة عدد الصفحات
                pdf_reader = PyPDF2.PdfReader(file)
                page_count = len(pdf_reader.pages)
                
                # حفظ الملف مؤقتًا
                file.seek(0)
                filename = secure_filename(file.filename)
                unique_id = str(uuid.uuid4())
                new_filename = f"{unique_id}_{filename}"
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], new_filename)
                file.save(file_path)
                
                uploaded_files.append({
                    'id': unique_id,
                    'name': filename,
                    'size': os.path.getsize(file_path),
                    'pages': page_count,
                    'path': file_path
                })
            except Exception as e:
                return jsonify({'error': f'Error processing {file.filename}: {str(e)}'}), 500
        else:
            return jsonify({'error': f'File type not allowed: {file.filename}'}), 400
    
    return jsonify({
        'files': uploaded_files
    })

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
        # العثور على الملف
        file_path = None
        for filename in os.listdir(app.config['UPLOAD_FOLDER']):
            if filename.startswith(file_id):
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                break
        
        if not file_path:
            return jsonify({'error': 'File not found'}), 404
        
        # قراءة ملف PDF الأصلي
        with open(file_path, 'rb') as f:
            pdf_reader = PyPDF2.PdfReader(f)
            results = []
            
            for i, range_item in enumerate(ranges):
                start_page = range_item['start'] - 1  # PyPDF2 يستخدم index من 0
                end_page = range_item['end']
                
                # إنشاء كاتب PDF جديد
                pdf_writer = PyPDF2.PdfWriter()
                
                # إضافة الصفحات المطلوبة
                for page_num in range(start_page, end_page):
                    if page_num < len(pdf_reader.pages):  # تأكد من أن الصفحة موجودة
                        pdf_writer.add_page(pdf_reader.pages[page_num])
                
                # حفظ الجزء الجديد في buffer
                output_buffer = BytesIO()
                pdf_writer.write(output_buffer)
                output_buffer.seek(0)
                
                # حفظ الملف الجزئي
                original_name = os.path.basename(file_path).split('_', 1)[1]
                base_name = os.path.splitext(original_name)[0]
                part_filename = f"{file_id}_part{i+1}.pdf"
                part_path = os.path.join(app.config['UPLOAD_FOLDER'], part_filename)
                
                with open(part_path, 'wb') as part_file:
                    part_file.write(output_buffer.getvalue())
                
                results.append({
                    'part': i+1,
                    'name': part_filename,
                    'size': os.path.getsize(part_path),
                    'pages': f"{range_item['start']}-{range_item['end']}"
                })
            
            return jsonify({'parts': results})
            
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/merge', methods=['POST'])
def merge_pdfs():
    data = request.json
    if not data:
        return jsonify({'error': 'Invalid JSON data'}), 400
        
    file_ids = data.get('file_ids')
    
    if not file_ids or not isinstance(file_ids, list) or len(file_ids) < 2:
        return jsonify({'error': 'يجب تحديد ملفين PDF على الأقل للدمج'}), 400
    
    try:
        # العثور على الملفات
        file_paths = []
        for file_id in file_ids:
            found = False
            for filename in os.listdir(app.config['UPLOAD_FOLDER']):
                if filename.startswith(file_id):
                    file_paths.append(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                    found = True
                    break
            
            if not found:
                return jsonify({'error': f'الملف برقم {file_id} غير موجود'}), 404
        
        # إنشاء ملف PDF جديد
        pdf_writer = PyPDF2.PdfWriter()
        
        # إضافة صفحات من كل ملف
        for file_path in file_paths:
            with open(file_path, 'rb') as f:
                pdf_reader = PyPDF2.PdfReader(f)
                for page in pdf_reader.pages:
                    pdf_writer.add_page(page)
        
        # حفظ الملف المدمج
        merged_id = str(uuid.uuid4())
        merged_filename = f"{merged_id}_merged.pdf"
        merged_path = os.path.join(app.config['UPLOAD_FOLDER'], merged_filename)
        
        with open(merged_path, 'wb') as output_file:
            pdf_writer.write(output_file)
        
        # حساب عدد الصفحات في الملف المدمج
        with open(merged_path, 'rb') as f:
            merged_reader = PyPDF2.PdfReader(f)
            page_count = len(merged_reader.pages)
        
        return jsonify({
            'id': merged_id,
            'name': merged_filename,
            'size': os.path.getsize(merged_path),
            'pages': page_count
        })
        
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
    
@app.route('/remove-pages', methods=['POST'])
def remove_pages():
    data = request.json
    if not data:
        return jsonify({'error': 'Invalid JSON data'}), 400
        
    file_id = data.get('file_id')
    pages_to_remove = data.get('pages')
    
    if not file_id or not pages_to_remove:
        return jsonify({'error': 'Missing parameters'}), 400
    
    try:
        # العثور على الملف
        file_path = None
        for filename in os.listdir(app.config['UPLOAD_FOLDER']):
            if filename.startswith(file_id):
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                break
        
        if not file_path:
            return jsonify({'error': 'File not found'}), 404
        
        # قراءة ملف PDF الأصلي
        with open(file_path, 'rb') as f:
            pdf_reader = PyPDF2.PdfReader(f)
            pdf_writer = PyPDF2.PdfWriter()
            
            # إضافة جميع الصفحات ما عدا المحددة
            for page_num in range(len(pdf_reader.pages)):
                if (page_num + 1) not in pages_to_remove:
                    pdf_writer.add_page(pdf_reader.pages[page_num])
            
            # حفظ الملف الجديد
            original_name = os.path.basename(file_path).split('_', 1)[1]
            new_id = str(uuid.uuid4())
            new_filename = f"{new_id}_removed_pages_{original_name}"
            new_path = os.path.join(app.config['UPLOAD_FOLDER'], new_filename)
            
            with open(new_path, 'wb') as output_file:
                pdf_writer.write(output_file)
            
            return jsonify({
                'id': new_id,
                'name': new_filename,
                'size': os.path.getsize(new_path),
                'pages': len(pdf_writer.pages)
            })
            
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/scan-to-pdf', methods=['POST'])
def scan_to_pdf():
    """تحويل الصور المرفوعة إلى ملف PDF واحد"""
    if 'images[]' not in request.files:
        return jsonify({'error': 'لم يتم رفع أي صور'}), 400
    
    images = request.files.getlist('images[]')
    valid_images = [img for img in images if allowed_file(img.filename)]
    
    if len(valid_images) == 0:
        return jsonify({'error': 'الملفات المرفوعة غير مدعومة'}), 400

    try:
        # تحويل الصور إلى PDF
        pdf_data = img2pdf.convert([image.stream for image in valid_images])
        
        # إنشاء اسم ملف فريد
        file_id = str(uuid.uuid4())
        original_name = "مستند-ممسوح.pdf"
        filename = f"{file_id}_{secure_filename(original_name)}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        # حفظ الملف
        with open(filepath, 'wb') as f:
            f.write(pdf_data)
        
        return jsonify({
            'id': file_id,
            'name': filename,
            'size': os.path.getsize(filepath),
            'pages': len(valid_images),
            'date': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        })
        
    except img2pdf.ValidationError as e:
        return jsonify({'error': f'خطأ في الصور: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'error': f'خطأ غير متوقع: {str(e)}'}), 500

@app.route('/download/<filename>')
def download_file(filename):
    try:
        return send_from_directory(
            app.config['UPLOAD_FOLDER'],
            filename,
            as_attachment=True
        )
    except Exception as e:
        return jsonify({'error': f'Error downloading file: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)