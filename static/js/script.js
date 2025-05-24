document.addEventListener('DOMContentLoaded', function () {
    // Initialize PDF.js
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';

    // Mobile menu toggle
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const nav = document.querySelector('.nav');

    mobileMenuBtn.addEventListener('click', function () {
        nav.classList.toggle('active');
    });

    // Smooth scrolling for navigation links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);

            if (targetElement) {
                const headerHeight = document.querySelector('.header').offsetHeight;
                const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - headerHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });

                // Close mobile menu if open
                nav.classList.remove('active');
            }
        });
    });

    // Modal functionality
    const modal = document.getElementById('download-modal');
    const closeModal = document.querySelector('.close-modal');
    const downloadBtn = document.getElementById('download-btn');

    function openModal(downloadUrl, message, filename) {
        downloadBtn.href = downloadUrl;
        downloadBtn.setAttribute('download', filename);
        document.getElementById('modal-message').textContent = message || 'Click the button below to download your processed PDF file.';
        modal.style.display = 'flex';
    }

    closeModal.addEventListener('click', function () {
        modal.style.display = 'none';
    });

    window.addEventListener('click', function (e) {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Create file item element with drag handle and page count
    function createFileItem(file, pageCount = null) {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.draggable = true;
        fileItem.dataset.fileName = file.name;
        
        let fileInfo = `
            <div class="file-info">
                <i class="fas fa-file-pdf file-icon"></i>
                <span>${file.name} (${formatFileSize(file.size)})</span>
        `;
        
        if (pageCount !== null) {
            fileInfo += `<span class="page-count">${pageCount} pages</span>`;
        }
        
        fileInfo += `
            </div>
            <button class="file-remove">
                <i class="fas fa-times"></i>
            </button>
            <div class="drag-handle">
                <i class="fas fa-grip-lines"></i>
            </div>
        `;
        
        fileItem.innerHTML = fileInfo;
        return fileItem;
    }

    // File upload handling for all tools
    function setupFileUpload(inputId, areaId, previewId, multiple) {
        const fileInput = document.getElementById(inputId);
        const uploadArea = document.getElementById(areaId);

        if (!fileInput || !uploadArea) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            uploadArea.addEventListener(eventName, highlight, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, unhighlight, false);
        });

        function highlight() {
            uploadArea.style.borderColor = 'var(--primary-color)';
        }

        function unhighlight() {
            uploadArea.style.borderColor = 'var(--accent-color)';
        }

        uploadArea.addEventListener('drop', handleDrop, false);
        fileInput.addEventListener('change', function (e) {
            handleFiles(e, previewId);
        });

        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;
            fileInput.files = files;
            handleFiles({ target: fileInput }, previewId);
        }
    }

    // Handle uploaded files and display preview
    async function handleFiles(e, previewId) {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const previewArea = document.getElementById(previewId);
        if (!previewArea) return;

        previewArea.innerHTML = '';

        if (files.length === 1) {
            const file = files[0];
            try {
                const pageCount = await getPdfPageCount(file);
                const fileItem = createFileItem(file, pageCount);
                previewArea.appendChild(fileItem);

                // Add remove file event
                fileItem.querySelector('.file-remove').addEventListener('click', () => {
                    e.target.value = '';
                    previewArea.innerHTML = '';
                });

                // Update placeholder in Split tool
                if (previewId === 'split-preview') {
                    document.getElementById('split-pages').placeholder = `e.g. 1-${pageCount}, 5, 7-9`;
                }

            } catch (error) {
                const fileItem = createFileItem(file);
                previewArea.appendChild(fileItem);
                console.error('Error getting page count:', error);
            }
        } else {
            const fileList = document.createElement('div');
            fileList.className = 'file-list';
            previewArea.appendChild(fileList);

            const filesContainer = document.createElement('div');
            filesContainer.className = 'sortable-files';
            fileList.appendChild(filesContainer);

            for (const file of files) {
                const fileItem = createFileItem(file);
                filesContainer.appendChild(fileItem);
            }

            // Make files sortable for merge order
            new Sortable(filesContainer, {
                animation: 150,
                handle: '.drag-handle',
                ghostClass: 'sortable-ghost',
                onEnd: function() {
                    updateFileInputOrder(e.target, filesContainer);
                }
            });

            // Add remove file events
            previewArea.querySelectorAll('.file-remove').forEach((btn, index) => {
                btn.addEventListener('click', function() {
                    const newFiles = Array.from(e.target.files);
                    newFiles.splice(index, 1);
                    
                    const dataTransfer = new DataTransfer();
                    newFiles.forEach(file => dataTransfer.items.add(file));
                    e.target.files = dataTransfer.files;
                    
                    handleFiles({ target: e.target }, previewId);
                });
            });
        }
    }

    // Update file input order after drag and drop
    function updateFileInputOrder(fileInput, filesContainer) {
        const fileNames = Array.from(filesContainer.querySelectorAll('.file-item'))
            .map(item => item.dataset.fileName);
        
        const files = Array.from(fileInput.files);
        const newFiles = [];
        
        fileNames.forEach(name => {
            const file = files.find(f => f.name === name);
            if (file) newFiles.push(file);
        });
        
        const dataTransfer = new DataTransfer();
        newFiles.forEach(file => dataTransfer.items.add(file));
        fileInput.files = dataTransfer.files;
    }

    // Get PDF page count using PDF.js
    async function getPdfPageCount(file) {
        return new Promise((resolve, reject) => {
            const fileReader = new FileReader();

            fileReader.onload = function () {
                try {
                    const typedArray = new Uint8Array(this.result);
                    const pdf = pdfjsLib.getDocument(typedArray);

                    pdf.promise.then(function (pdf) {
                        resolve(pdf.numPages);
                    }).catch(function (error) {
                        reject(error);
                    });
                } catch (error) {
                    reject(error);
                }
            };

            fileReader.onerror = function (error) {
                reject(error);
            };

            fileReader.readAsArrayBuffer(file);
        });
    }

    // Format file size to human readable format
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Initialize Sortable for arrange pages
    let sortable;
    const sortableContainer = document.getElementById('sortable-pages');

    document.getElementById('arrange-file').addEventListener('change', async function (e) {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        try {
            const pageCount = await getPdfPageCount(file);

            sortableContainer.innerHTML = '';
            for (let i = 1; i <= pageCount; i++) {
                const page = document.createElement('div');
                page.className = 'page-thumbnail';
                page.setAttribute('data-original-page', i); // حفظ رقم الصفحة الأصلي
                page.setAttribute('data-page-number', i);   // رقم الصفحة الحالي
                page.textContent = `Page ${i}`;
                sortableContainer.appendChild(page);
            }

            if (!sortable) {
                sortable = new Sortable(sortableContainer, {
                    animation: 150,
                    ghostClass: 'sortable-ghost',
                    onEnd: function () {
                        // تحديث الأرقام الظاهرة فقط دون تغيير البيانات الأصلية
                        Array.from(sortableContainer.children).forEach((el, index) => {
                            el.setAttribute('data-page-number', index + 1);
                            el.textContent = `Page ${index + 1}`;
                        });
                    }
                });
            }
        } catch (error) {
            console.error('Error loading PDF:', error);
        }
    }
});

    // Setup all file upload areas
    setupFileUpload('merge-files', 'merge-upload-area', 'merge-preview', true);
    setupFileUpload('split-file', 'split-upload-area', 'split-preview', false);
    setupFileUpload('remove-file', 'remove-upload-area', 'remove-preview', false);
    setupFileUpload('arrange-file', 'arrange-upload-area', 'arrange-preview', false);

    // Tool button event listeners
    document.getElementById('merge-btn').addEventListener('click', handleMerge);
    document.getElementById('split-btn').addEventListener('click', handleSplit);
    document.getElementById('remove-btn').addEventListener('click', handleRemove);
    document.getElementById('arrange-btn').addEventListener('click', handleArrange);

    // Split method change
    document.querySelectorAll('input[name="split-method"]').forEach(radio => {
        radio.addEventListener('change', function () {
            const intervalInput = document.getElementById('split-interval');
            const pagesInput = document.getElementById('split-pages');

            if (this.id === 'split-range') {
                intervalInput.disabled = true;
                pagesInput.disabled = false;
            } else {
                intervalInput.disabled = false;
                pagesInput.disabled = true;
            }
        });
    });

    // Tool handlers
    async function handleMerge() {
        const fileInput = document.getElementById('merge-files');
        const files = fileInput.files;
        if (!files || files.length < 2) {
            alert('Please select at least 2 PDF files to merge.');
            return;
        }

        showProcessing(true);

        const formData = new FormData();
        Array.from(files).forEach(file => {
            formData.append('files', file);
        });

        try {
            const response = await fetch('/merge', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(error || 'Merge failed');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            openModal(url, 'Your merged PDF is ready to download!', 'merged.pdf');
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            showProcessing(false);
        }
    }

    async function handleSplit() {
        const file = document.getElementById('split-file').files[0];
        if (!file) {
            alert('Please select a PDF file to split.');
            return;
        }

        const splitByRange = document.getElementById('split-range').checked;
        const formData = new FormData();
        formData.append('file', file);

        if (splitByRange) {
            const pagesInput = document.getElementById('split-pages').value.trim();
            if (!pagesInput) {
                alert('Please enter page ranges to split by (e.g. 1-3, 5, 7-9).');
                return;
            }
            formData.append('method', 'range');
            formData.append('pages', pagesInput);
        } else {
            const interval = parseInt(document.getElementById('split-interval').value);
            if (isNaN(interval) || interval < 1) {
                alert('Please enter a valid interval (1 or more).');
                return;
            }
            formData.append('method', 'interval');
            formData.append('interval', interval);
        }

        showProcessing(true);

        try {
            const response = await fetch('/split', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(error || 'Split failed');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const outputName = splitByRange ? `split_${file.name}` : `split_${file.name.replace('.pdf', '')}_parts.zip`;
            openModal(url, 'Your split PDF files are ready to download!', outputName);
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            showProcessing(false);
        }
    }

    async function handleRemove() {
        const file = document.getElementById('remove-file').files[0];
        if (!file) {
            alert('Please select a PDF file to remove pages from.');
            return;
        }

        const pagesToRemove = document.getElementById('pages-to-remove').value.trim();
        if (!pagesToRemove) {
            alert('Please enter pages to remove (e.g. 1,3,5-8).');
            return;
        }

        showProcessing(true);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('pages', pagesToRemove);

        try {
            const response = await fetch('/remove-pages', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(error || 'Remove pages failed');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            openModal(url, 'Your modified PDF with pages removed is ready to download!', `removed_pages_${file.name}`);
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            showProcessing(false);
        }
    }

    async function handleArrange() {
    const file = document.getElementById('arrange-file').files[0];
    if (!file) {
        alert('Please select a PDF file to rearrange.');
        return;
    }

    // Get the CURRENT order from DOM elements (not data-page-number)
    const pageElements = Array.from(sortableContainer.children);
    const newOrder = pageElements.map((el, index) => {
        // Get the original page number from data attribute
        return parseInt(el.getAttribute('data-original-page')) || (index + 1);
    });

    showProcessing(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('order', newOrder.join(','));

    try {
        const response = await fetch('/arrange-pages', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(error || 'Arrange pages failed');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        openModal(url, 'Your PDF with rearranged pages is ready to download!', `rearranged_${file.name}`);
    } catch (error) {
        alert(`Error: ${error.message}`);
    } finally {
        showProcessing(false);
    }
}

    function showProcessing(show) {
        const processingOverlay = document.getElementById('processing-overlay');

        if (show) {
            if (!processingOverlay) {
                const overlay = document.createElement('div');
                overlay.id = 'processing-overlay';
                overlay.style.position = 'fixed';
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.width = '100%';
                overlay.style.height = '100%';
                overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
                overlay.style.display = 'flex';
                overlay.style.justifyContent = 'center';
                overlay.style.alignItems = 'center';
                overlay.style.zIndex = '10000';
                overlay.innerHTML = `
                    <div style="text-align: center; color: white;">
                        <i class="fas fa-spinner fa-spin" style="font-size: 3rem; margin-bottom: 20px;"></i>
                        <h2>Processing your PDF...</h2>
                        <p>This may take a few moments</p>
                    </div>
                `;
                document.body.appendChild(overlay);
            }
        } else {
            if (processingOverlay) {
                processingOverlay.remove();
            }
        }
    }
});