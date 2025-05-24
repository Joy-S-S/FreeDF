// script.js - Full Client-Side Logic for PDF Tools (Cloudinary Support)

document.addEventListener('DOMContentLoaded', function () {
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';

    // === Elements ===
    const downloadBtn = document.getElementById('download-btn');
    const modal = document.getElementById('download-modal');
    let cloudinaryPublicId = null;

    // === Utils ===
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async function getPdfPageCount(file) {
        const reader = new FileReader();
        return new Promise((resolve, reject) => {
            reader.onload = function () {
                const typedArray = new Uint8Array(this.result);
                pdfjsLib.getDocument(typedArray).promise.then(pdf => {
                    resolve(pdf.numPages);
                }).catch(err => reject(err));
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    function showModal(url, message, filename, publicId) {
        downloadBtn.href = url;
        downloadBtn.setAttribute('download', filename);
        document.getElementById('modal-message').textContent = message || 'Click below to download your file.';
        modal.style.display = 'flex';
        cloudinaryPublicId = publicId;
    }

    function showProcessing(show) {
        let overlay = document.getElementById('processing-overlay');
        if (show) {
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'processing-overlay';
                overlay.style.position = 'fixed';
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.width = '100%';
                overlay.style.height = '100%';
                overlay.style.background = 'rgba(0,0,0,0.8)';
                overlay.style.display = 'flex';
                overlay.style.justifyContent = 'center';
                overlay.style.alignItems = 'center';
                overlay.style.zIndex = '9999';
                overlay.innerHTML = `
                    <div style="text-align:center; color:white">
                        <i class="fas fa-spinner fa-spin" style="font-size:3rem"></i>
                        <p style="margin-top: 20px;">Processing your file...</p>
                    </div>`;
                document.body.appendChild(overlay);
            }
        } else if (overlay) {
            overlay.remove();
        }
    }

    downloadBtn.addEventListener('click', function () {
        if (cloudinaryPublicId) {
            setTimeout(() => {
                fetch('/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ public_id: cloudinaryPublicId })
                });
            }, 4000);
        }
    });

    document.querySelector('.close-modal').addEventListener('click', () => {
        modal.style.display = 'none';
        cloudinaryPublicId = null;
    });

    window.addEventListener('click', function (e) {
        if (e.target === modal) {
            modal.style.display = 'none';
            cloudinaryPublicId = null;
        }
    });

    // === File Upload Handling ===
    async function uploadSingleFile(inputId, previewId, callback) {
        const input = document.getElementById(inputId);
        const preview = document.getElementById(previewId);
        preview.innerHTML = '';

        if (!input.files || input.files.length === 0) return;
        const file = input.files[0];

        try {
            const pageCount = await getPdfPageCount(file);
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <div class="file-info">
                    <i class="fas fa-file-pdf"></i>
                    <span>${file.name} (${formatFileSize(file.size)})</span>
                    <span class="page-count">${pageCount} pages</span>
                </div>
                <button class="file-remove"><i class="fas fa-times"></i></button>`;
            preview.appendChild(fileItem);

            fileItem.querySelector('.file-remove').addEventListener('click', () => {
                input.value = '';
                preview.innerHTML = '';
            });

            callback(file);
        } catch (err) {
            alert('Invalid PDF.');
        }
    }

    async function uploadMultipleFiles(inputId, previewId, callback) {
        const input = document.getElementById(inputId);
        const preview = document.getElementById(previewId);
        preview.innerHTML = '';

        const container = document.createElement('div');
        container.className = 'sortable-files';
        preview.appendChild(container);

        const files = Array.from(input.files);
        files.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.dataset.filename = file.name;
            fileItem.innerHTML = `
                <div class="file-info">
                    <i class="fas fa-file-pdf"></i>
                    <span>${file.name} (${formatFileSize(file.size)})</span>
                </div>
                <button class="file-remove"><i class="fas fa-times"></i></button>
                <div class="drag-handle"><i class="fas fa-grip-lines"></i></div>`;
            container.appendChild(fileItem);
        });

        new Sortable(container, {
            animation: 150,
            handle: '.drag-handle'
        });

        preview.querySelectorAll('.file-remove').forEach((btn, idx) => {
            btn.addEventListener('click', () => {
                files.splice(idx, 1);
                const dataTransfer = new DataTransfer();
                files.forEach(f => dataTransfer.items.add(f));
                input.files = dataTransfer.files;
                uploadMultipleFiles(inputId, previewId, callback);
            });
        });

        callback(files);
    }

    // === Button Actions ===

    document.getElementById('merge-btn').addEventListener('click', async () => {
        const files = document.getElementById('merge-files').files;
        if (!files || files.length < 2) return alert('Select at least 2 PDFs.');

        showProcessing(true);
        const form = new FormData();
        Array.from(files).forEach(file => form.append('files', file));

        try {
            const res = await fetch('/merge', { method: 'POST', body: form });
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            showModal(json.url, json.message, 'merged.pdf', json.cloudinary_id);
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            showProcessing(false);
        }
    });

    document.getElementById('split-btn').addEventListener('click', async () => {
        const file = document.getElementById('split-file').files[0];
        if (!file) return alert('Select a PDF file.');

        const form = new FormData();
        form.append('file', file);
        const byRange = document.getElementById('split-range').checked;

        if (byRange) {
            const ranges = document.getElementById('split-pages').value.trim();
            if (!ranges) return alert('Enter page ranges.');
            form.append('method', 'range');
            form.append('pages', ranges);
        } else {
            const interval = document.getElementById('split-interval').value.trim();
            if (!interval) return alert('Enter interval.');
            form.append('method', 'interval');
            form.append('interval', interval);
        }

        showProcessing(true);

        try {
            const res = await fetch('/split', { method: 'POST', body: form });
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            showModal(json.url, json.message, 'split.pdf', json.cloudinary_id);
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            showProcessing(false);
        }
    });

    document.getElementById('remove-btn').addEventListener('click', async () => {
        const file = document.getElementById('remove-file').files[0];
        const pages = document.getElementById('pages-to-remove').value.trim();
        if (!file || !pages) return alert('Select file and enter pages to remove.');

        const form = new FormData();
        form.append('file', file);
        form.append('pages', pages);

        showProcessing(true);
        try {
            const res = await fetch('/remove-pages', { method: 'POST', body: form });
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            showModal(json.url, json.message, 'removed.pdf', json.cloudinary_id);
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            showProcessing(false);
        }
    });

    document.getElementById('arrange-btn').addEventListener('click', async () => {
        const file = document.getElementById('arrange-file').files[0];
        if (!file) return alert('Select a PDF.');

        const order = Array.from(document.querySelectorAll('.page-thumbnail')).map(p => p.dataset.originalPage);
        const form = new FormData();
        form.append('file', file);
        form.append('order', order.join(','));

        showProcessing(true);
        try {
            const res = await fetch('/arrange-pages', { method: 'POST', body: form });
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            showModal(json.url, json.message, 'arranged.pdf', json.cloudinary_id);
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            showProcessing(false);
        }
    });

    // === Setup Upload Listeners ===
    document.getElementById('merge-files').addEventListener('change', () => {
        uploadMultipleFiles('merge-files', 'merge-preview', () => {});
    });
    document.getElementById('split-file').addEventListener('change', () => {
        uploadSingleFile('split-file', 'split-preview', () => {});
    });
    document.getElementById('remove-file').addEventListener('change', () => {
        uploadSingleFile('remove-file', 'remove-preview', () => {});
    });
    document.getElementById('arrange-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        const sortableContainer = document.getElementById('sortable-pages');
        sortableContainer.innerHTML = '';

        const pageCount = await getPdfPageCount(file);
        for (let i = 1; i <= pageCount; i++) {
            const page = document.createElement('div');
            page.className = 'page-thumbnail';
            page.dataset.originalPage = i;
            page.dataset.pageNumber = i;
            page.textContent = `Page ${i}`;
            sortableContainer.appendChild(page);
        }

        new Sortable(sortableContainer, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: () => {
                Array.from(sortableContainer.children).forEach((el, i) => {
                    el.dataset.pageNumber = i + 1;
                    el.textContent = `Page ${i + 1}`;
                });
            }
        });
    });
});
