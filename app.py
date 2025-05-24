import os
import io
import zipfile
from flask import Flask, render_template, request, send_file, jsonify, send_from_directory
from werkzeug.utils import secure_filename
import fitz  # PyMuPDF
import sys

app = Flask(__name__, static_folder='static')
app.config['UPLOAD_FOLDER'] = 'uploads'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def allowed_file(filename, extensions=['pdf']):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in extensions

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/merge', methods=['POST'])
def merge_pdfs():
    if 'files' not in request.files:
        return jsonify({"error": "No files uploaded"}), 400

    files = request.files.getlist('files')
    if len(files) < 2:
        return jsonify({"error": "Upload at least 2 files"}), 400

    output_pdf = fitz.open()  # PyMuPDF
    output_buffer = BytesIO()  # تخزين النتيجة في الذاكرة

    try:
        for file in files:
            file_buffer = BytesIO(file.read())  # قراءة الملف في الذاكرة
            pdf = fitz.open("pdf", file_buffer)
            output_pdf.insert_pdf(pdf)
            pdf.close()

        output_pdf.save(output_buffer)
        output_pdf.close()
        output_buffer.seek(0)

        return send_file(
            output_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name='merged.pdf'
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/split', methods=['POST'])
def split_pdf():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    if not file or not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type. Only PDF files are allowed.'}), 400

    split_method = request.form.get('method', 'range')
    pages = request.form.get('pages', '')
    interval = request.form.get('interval', '1')

    try:
        filename = secure_filename(file.filename)
        temp_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(temp_path)
        pdf = fitz.open(temp_path)

        if split_method == 'range':
            page_ranges = parse_page_ranges(pages, len(pdf))
            if not page_ranges:
                pdf.close()
                os.remove(temp_path)
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
            
            return send_file(
                output,
                as_attachment=True,
                download_name=f'split_{filename}',
                mimetype='application/pdf'
            )

        else:
            interval = int(interval)
            if interval < 1:
                pdf.close()
                os.remove(temp_path)
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
                    zip_file.writestr(f'split_part_{part_num}_pages_{start+1}-{end}.pdf', buf)
                    part_num += 1

            zip_buffer.seek(0)
            pdf.close()
            os.remove(temp_path)
            return send_file(
                zip_buffer,
                as_attachment=True,
                download_name=f'split_{filename.replace(".pdf", "")}_parts.zip',
                mimetype='application/zip'
            )

    except Exception as e:
        if os.path.exists(temp_path):
            try:
                if 'pdf' in locals() and not pdf.is_closed:
                    pdf.close()
            except Exception:
                pass
            os.remove(temp_path)
        return jsonify({'error': str(e)}), 500

@app.route('/remove-pages', methods=['POST'])
def remove_pages():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    if not file or not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type. Only PDF files are allowed.'}), 400

    pages_to_remove = request.form.get('pages', '')
    try:
        filename = secure_filename(file.filename)
        temp_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(temp_path)
        pdf = fitz.open(temp_path)

        ranges = parse_page_ranges(pages_to_remove, len(pdf))
        if not ranges:
            pdf.close()
            os.remove(temp_path)
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
        return send_file(
            output,
            as_attachment=True,
            download_name=f'removed_pages_{filename}',
            mimetype='application/pdf'
        )

    except Exception as e:
        if os.path.exists(temp_path):
            pdf.close()
            os.remove(temp_path)
        return jsonify({'error': str(e)}), 500

@app.route('/arrange-pages', methods=['POST'])
def arrange_pages():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    if not file or not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type. Only PDF files are allowed.'}), 400

    order = request.form.get('order', '')
    if not order:
        return jsonify({'error': 'No page order specified'}), 400

    try:
        page_order = list(map(int, order.split(',')))
        filename = secure_filename(file.filename)
        temp_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(temp_path)
        pdf = fitz.open(temp_path)

        if any(p < 1 or p > len(pdf) for p in page_order):
            pdf.close()
            os.remove(temp_path)
            return jsonify({'error': 'Invalid page numbers in order list'}), 400

        new_pdf = fitz.open()
        for page_num in page_order:
            new_pdf.insert_pdf(pdf, from_page=page_num-1, to_page=page_num-1)

        output = io.BytesIO()
        new_pdf.save(output)
        output.seek(0)
        pdf.close()
        os.remove(temp_path)
        return send_file(
            output,
            as_attachment=True,
            download_name=f'rearranged_{filename}',
            mimetype='application/pdf'
        )

    except Exception as e:
        if os.path.exists(temp_path):
            pdf.close()
            os.remove(temp_path)
        return jsonify({'error': str(e)}), 500

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

def cleanup_temp_files(files):
    for file in files:
        if os.path.exists(file):
            try:
                os.remove(file)
            except Exception as e:
                print(f"Error removing file {file}: {e}", file=sys.stderr)


@app.route('/static/<path:filename>')
def static_files(filename):
    return send_from_directory('static', filename)
if __name__ == '__main__':
    app.run(debug=True)
