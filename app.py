# app.py (Cloudinary-enabled Flask App for PDF tools)
import os
import io
import zipfile
import tempfile
import requests
from flask import Flask, render_template, request, send_file, jsonify
from werkzeug.utils import secure_filename
import fitz  # PyMuPDF
import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = tempfile.gettempdir()

# Configure Cloudinary
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True
)

def allowed_file(filename, extensions=['pdf']):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in extensions

def upload_to_cloudinary(file):
    result = cloudinary.uploader.upload_large(file, resource_type="raw")
    return result['secure_url'], result['public_id']

def delete_from_cloudinary(public_id):
    cloudinary.uploader.destroy(public_id, resource_type="raw")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/merge', methods=['POST'])
def merge_pdfs():
    files = request.files.getlist('files')
    if len(files) < 2:
        return jsonify({'error': 'Please upload at least 2 PDF files'}), 400

    output_pdf = fitz.open()
    cloudinary_ids = []

    try:
        for file in files:
            if file and allowed_file(file.filename):
                file_url, file_id = upload_to_cloudinary(file)
                cloudinary_ids.append(file_id)

                temp_path = os.path.join(tempfile.gettempdir(), secure_filename(file.filename))
                with open(temp_path, 'wb') as f:
                    f.write(requests.get(file_url).content)

                pdf = fitz.open(temp_path)
                output_pdf.insert_pdf(pdf)
                pdf.close()
                os.remove(temp_path)

        output = io.BytesIO()
        output_pdf.save(output)
        output.seek(0)
        output_pdf.close()

        result = cloudinary.uploader.upload_large(output, resource_type="raw")
        download_url = result['secure_url']
        download_id = result['public_id']

        return jsonify({
            'url': download_url,
            'cloudinary_id': download_id,
            'message': 'Your merged PDF is ready!'
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        for file_id in cloudinary_ids:
            delete_from_cloudinary(file_id)

@app.route('/split', methods=['POST'])
def split_pdf():
    file = request.files.get('file')
    if not file or not allowed_file(file.filename):
        return jsonify({'error': 'Invalid or missing file'}), 400

    split_method = request.form.get('method', 'range')
    pages = request.form.get('pages', '')
    interval = request.form.get('interval', '1')

    try:
        file_url, file_id = upload_to_cloudinary(file)
        filename = secure_filename(file.filename)

        temp_path = os.path.join(tempfile.gettempdir(), filename)
        with open(temp_path, 'wb') as f:
            f.write(requests.get(file_url).content)

        pdf = fitz.open(temp_path)

        if split_method == 'range':
            page_ranges = parse_page_ranges(pages, len(pdf))
            if not page_ranges:
                return jsonify({'error': 'Invalid page range format'}), 400

            new_pdf = fitz.open()
            for start, end in page_ranges:
                for page_num in range(start - 1, end):
                    new_pdf.insert_pdf(pdf, from_page=page_num, to_page=page_num)

            output = io.BytesIO()
            new_pdf.save(output)
            output.seek(0)
            pdf.close()
            os.remove(temp_path)

            result = cloudinary.uploader.upload_large(output, resource_type="raw")
            return jsonify({
                'url': result['secure_url'],
                'cloudinary_id': result['public_id'],
                'message': 'Your split PDF is ready!'
            })

        else:
            interval = int(interval)
            if interval < 1:
                return jsonify({'error': 'Interval must be at least 1'}), 400

            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                part_num = 1
                for start in range(0, len(pdf), interval):
                    new_pdf = fitz.open()
                    end = min(start + interval, len(pdf))
                    for page_num in range(start, end):
                        new_pdf.insert_pdf(pdf, from_page=page_num, to_page=page_num)
                    buf = new_pdf.tobytes()
                    zip_file.writestr(f'part_{part_num}.pdf', buf)
                    part_num += 1

            zip_buffer.seek(0)
            pdf.close()
            os.remove(temp_path)

            result = cloudinary.uploader.upload_large(zip_buffer, resource_type="raw")
            return jsonify({
                'url': result['secure_url'],
                'cloudinary_id': result['public_id'],
                'message': 'Your split PDF (ZIP) is ready!'
            })

    finally:
        delete_from_cloudinary(file_id)

@app.route('/remove-pages', methods=['POST'])
def remove_pages():
    file = request.files.get('file')
    pages = request.form.get('pages', '')

    if not file or not pages:
        return jsonify({'error': 'Missing file or pages'}), 400

    try:
        file_url, file_id = upload_to_cloudinary(file)
        filename = secure_filename(file.filename)
        temp_path = os.path.join(tempfile.gettempdir(), filename)
        with open(temp_path, 'wb') as f:
            f.write(requests.get(file_url).content)

        pdf = fitz.open(temp_path)
        ranges = parse_page_ranges(pages, len(pdf))
        if not ranges:
            return jsonify({'error': 'Invalid page range format'}), 400

        pages_to_keep = set(range(len(pdf)))
        for start, end in ranges:
            pages_to_keep -= set(range(start - 1, end))

        new_pdf = fitz.open()
        for i in sorted(pages_to_keep):
            new_pdf.insert_pdf(pdf, from_page=i, to_page=i)

        output = io.BytesIO()
        new_pdf.save(output)
        output.seek(0)
        pdf.close()
        os.remove(temp_path)

        result = cloudinary.uploader.upload_large(output, resource_type="raw")
        return jsonify({
            'url': result['secure_url'],
            'cloudinary_id': result['public_id'],
            'message': 'Pages removed and file ready!'
        })

    finally:
        delete_from_cloudinary(file_id)

@app.route('/arrange-pages', methods=['POST'])
def arrange_pages():
    file = request.files.get('file')
    order = request.form.get('order', '')

    if not file or not order:
        return jsonify({'error': 'Missing file or order'}), 400

    try:
        page_order = list(map(int, order.split(',')))
        file_url, file_id = upload_to_cloudinary(file)

        filename = secure_filename(file.filename)
        temp_path = os.path.join(tempfile.gettempdir(), filename)
        with open(temp_path, 'wb') as f:
            f.write(requests.get(file_url).content)

        pdf = fitz.open(temp_path)
        new_pdf = fitz.open()

        for page_num in page_order:
            if page_num < 1 or page_num > len(pdf):
                return jsonify({'error': 'Invalid page number'}), 400
            new_pdf.insert_pdf(pdf, from_page=page_num - 1, to_page=page_num - 1)

        output = io.BytesIO()
        new_pdf.save(output)
        output.seek(0)
        pdf.close()
        os.remove(temp_path)

        result = cloudinary.uploader.upload_large(output, resource_type="raw")
        return jsonify({
            'url': result['secure_url'],
            'cloudinary_id': result['public_id'],
            'message': 'Your arranged PDF is ready!'
        })

    finally:
        delete_from_cloudinary(file_id)

@app.route('/delete', methods=['POST'])
def delete_file():
    public_id = request.form.get('public_id')
    if public_id:
        try:
            delete_from_cloudinary(public_id)
            return '', 204
        except:
            return '', 500
    return '', 400

def parse_page_ranges(range_str, max_page):
    if not range_str:
        return None
    ranges = []
    parts = range_str.split(',')
    for part in parts:
        part = part.strip()
        if '-' in part:
            try:
                start, end = map(int, part.split('-'))
                if start < 1 or end > max_page or start > end:
                    return None
                ranges.append((start, end))
            except:
                return None
        else:
            try:
                page = int(part)
                if page < 1 or page > max_page:
                    return None
                ranges.append((page, page))
            except:
                return None
    return ranges

if __name__ == '__main__':
    app.run(debug=True)
