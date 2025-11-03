document.addEventListener('DOMContentLoaded', function () {
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
    // تعديل دالة createFileItem لضمان عرض المعلومات بشكل كامل
    function createFileItem(file, pageCount = null) {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.draggable = true;
        fileItem.dataset.fileName = file.name;

        const fileSize = formatFileSize(file.size);
        const pageInfo = pageCount !== null ? `${pageCount} pages` : 'Loading pages...';

        fileItem.innerHTML = `
        <div class="file-info">
            <i class="fas fa-file-pdf file-icon"></i>
            <div class="file-details">
                <span class="file-name">${file.name}</span>
                <span class="file-meta">${fileSize} • ${pageInfo}</span>
            </div>
            <button class="file-remove">
                <i class="fas fa-times"></i>
            </button>
            <div class="drag-handle">
                <i class="fas fa-grip-lines"></i>
            </div>
        </div>
    `;

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

    async function handleFiles(e, previewId) {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const previewArea = document.getElementById(previewId);
        if (!previewArea) return;

        // Special handling for images preview
        if (previewId === 'images-preview') {
            previewArea.innerHTML = '<div class="loading-files"><i class="fas fa-spinner fa-spin"></i> Loading images...</div>';

            try {
                const sortableContainer = document.getElementById('sortable-images');
                sortableContainer.innerHTML = '';

                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    if (!file.type.startsWith('image/')) continue;

                    const imgContainer = document.createElement('div');
                    imgContainer.className = 'image-thumbnail';
                    imgContainer.setAttribute('data-file-name', file.name);
                    imgContainer.setAttribute('data-file-index', i);

                    const img = document.createElement('img');
                    img.src = URL.createObjectURL(file);
                    img.onload = () => URL.revokeObjectURL(img.src);

                    const imgInfo = document.createElement('div');
                    imgInfo.className = 'image-info';
                    imgInfo.textContent = file.name;

                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'image-remove';
                    removeBtn.innerHTML = '<i class="fas fa-times"></i>';
                    removeBtn.addEventListener('click', () => {
                        const newFiles = Array.from(e.target.files);
                        newFiles.splice(i, 1);

                        const dataTransfer = new DataTransfer();
                        newFiles.forEach(file => dataTransfer.items.add(file));
                        e.target.files = dataTransfer.files;

                        handleFiles({ target: e.target }, previewId);
                    });

                    imgContainer.appendChild(img);
                    imgContainer.appendChild(imgInfo);
                    imgContainer.appendChild(removeBtn);
                    sortableContainer.appendChild(imgContainer);
                }

                // Initialize Sortable for images
                new Sortable(sortableContainer, {
                    animation: 150,
                    ghostClass: 'sortable-ghost',
                    onEnd: function () {
                        updateFileInputOrderImages(e.target, sortableContainer);
                    }
                });

                previewArea.innerHTML = `<p>${files.length} image(s) loaded. Drag to reorder.</p>`;

            } catch (error) {
                console.error('Error loading images:', error);
                previewArea.innerHTML = '<div class="error-message">Error loading images. Please try again.</div>';
            }
        } else {
            // Original PDF handling code remains the same
            previewArea.innerHTML = '<div class="loading-files"><i class="fas fa-spinner fa-spin"></i> Loading files...</div>';

            try {
                const filesWithPageCount = await Promise.all(
                    Array.from(files).map(async file => {
                        try {
                            const pageCount = await getPdfPageCount(file);
                            return { file, pageCount };
                        } catch (error) {
                            console.error('Error getting page count:', error);
                            return { file, pageCount: null };
                        }
                    })
                );

                previewArea.innerHTML = '';

                if (filesWithPageCount.length === 1) {
                    const { file, pageCount } = filesWithPageCount[0];
                    const fileItem = createFileItem(file, pageCount);
                    previewArea.appendChild(fileItem);

                    fileItem.querySelector('.file-remove').addEventListener('click', () => {
                        e.target.value = '';
                        previewArea.innerHTML = '';

                        if (previewId === 'arrange-preview') {
                            const sortablePages = document.getElementById('sortable-pages');
                            if (sortablePages) {
                                sortablePages.innerHTML = '';
                            }
                        }
                    });

                    if (previewId === 'split-preview' && pageCount) {
                        document.getElementById('split-pages').placeholder = `e.g. 1-${pageCount}, 5, 7-9`;
                    }
                } else {
                    const filesContainer = document.createElement('div');
                    filesContainer.className = 'sortable-files';
                    previewArea.appendChild(filesContainer);

                    filesWithPageCount.forEach(({ file, pageCount }) => {
                        const fileItem = createFileItem(file, pageCount);
                        filesContainer.appendChild(fileItem);
                    });

                    new Sortable(filesContainer, {
                        animation: 150,
                        handle: '.drag-handle',
                        ghostClass: 'sortable-ghost',
                        onEnd: function () {
                            updateFileInputOrder(e.target, filesContainer);
                        }
                    });

                    previewArea.querySelectorAll('.file-remove').forEach((btn, index) => {
                        btn.addEventListener('click', function () {
                            const newFiles = Array.from(e.target.files);
                            newFiles.splice(index, 1);

                            const dataTransfer = new DataTransfer();
                            newFiles.forEach(file => dataTransfer.items.add(file));
                            e.target.files = dataTransfer.files;

                            handleFiles({ target: e.target }, previewId);
                        });
                    });
                }
            } catch (error) {
                console.error('Error processing files:', error);
                previewArea.innerHTML = '<div class="error-message">Error loading files. Please try again.</div>';
            }
        }
    }

    document.getElementById('images-btn').addEventListener('click', handleImagesToPdf);

    async function handleImagesToPdf() {
        const fileInput = document.getElementById('images-files');
        const files = fileInput.files;
        if (!files || files.length === 0) {
            alert('Please select at least one image file.');
            return;
        }

        showProcessing(true);

        try {
            const { PDFDocument, rgb } = PDFLib;
            const pdfDoc = await PDFDocument.create();

            // Get page size options
            const pageSize = document.getElementById('pdf-page-size').value;
            const margin = parseFloat(document.getElementById('pdf-margin').value) || 0;
            const fitOption = document.getElementById('pdf-fit').value;

            let pageWidth, pageHeight;

            switch (pageSize) {
                case 'A4':
                    pageWidth = 595.28; // 210mm in points (1mm = 2.83465 points)
                    pageHeight = 841.89; // 297mm
                    break;
                case 'Letter':
                    pageWidth = 612; // 216mm
                    pageHeight = 792; // 279mm
                    break;
                case 'A5':
                    pageWidth = 420.94; // 148mm
                    pageHeight = 595.28; // 210mm
                    break;
                case 'A3':
                    pageWidth = 841.89; // 297mm
                    pageHeight = 1190.55; // 420mm
                    break;
                case 'Custom':
                    const customWidth = parseFloat(document.getElementById('pdf-custom-width').value) || 210;
                    const customHeight = parseFloat(document.getElementById('pdf-custom-height').value) || 297;
                    pageWidth = customWidth * 2.83465;
                    pageHeight = customHeight * 2.83465;
                    break;
                default:
                    pageWidth = 595.28;
                    pageHeight = 841.89;
            }

            const marginPoints = margin * 2.83465;
            const contentWidth = pageWidth - (marginPoints * 2);
            const contentHeight = pageHeight - (marginPoints * 2);

            // Process images in order
            for (let i = 0; i < files.length; i++) {
                const file = files[i];

                // Create a new page for each image
                const page = pdfDoc.addPage([pageWidth, pageHeight]);

                // Draw image on the page
                try {
                    const imageBytes = await file.arrayBuffer();
                    let image;

                    // Check image type
                    if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
                        image = await pdfDoc.embedJpg(imageBytes);
                    } else if (file.type === 'image/png') {
                        image = await pdfDoc.embedPng(imageBytes);
                    } else {
                        // Try to embed as JPEG by default
                        try {
                            image = await pdfDoc.embedJpg(imageBytes);
                        } catch (e) {
                            image = await pdfDoc.embedPng(imageBytes);
                        }
                    }

                    // Calculate dimensions based on fit option
                    let width, height;

                    if (fitOption === 'original') {
                        width = image.width;
                        height = image.height;
                    } else if (fitOption === 'fit') {
                        const ratio = Math.min(
                            contentWidth / image.width,
                            contentHeight / image.height
                        );
                        width = image.width * ratio;
                        height = image.height * ratio;
                    } else { // fill
                        width = contentWidth;
                        height = contentHeight;
                    }

                    // Center the image on the page
                    const x = marginPoints + (contentWidth - width) / 2;
                    const y = marginPoints + (contentHeight - height) / 2;

                    page.drawImage(image, {
                        x,
                        y,
                        width,
                        height,
                    });

                } catch (error) {
                    console.error(`Error processing image ${file.name}:`, error);
                    // If image fails to embed, add a blank page with error message
                    page.drawText(`Error loading image: ${file.name}`, {
                        x: 50,
                        y: pageHeight - 50,
                        size: 12,
                        color: rgb(1, 0, 0),
                    });
                }
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            openModal(url, 'Your PDF created from images is ready to download!', 'images.pdf');
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            showProcessing(false);
        }
    }

    // Update file input order after drag and drop
    function updateFileInputOrderImages(fileInput, filesContainer) {
        const fileNames = Array.from(filesContainer.querySelectorAll('.image-thumbnail'))
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

    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';

    async function getPdfPageCount(file) {
        return new Promise((resolve, reject) => {
            const fileReader = new FileReader();

            fileReader.onload = function () {
                try {
                    const typedArray = new Uint8Array(this.result);
                    const loadingTask = pdfjsLib.getDocument(typedArray);

                    loadingTask.promise.then(function (pdf) {
                        resolve(pdf.numPages);
                        pdf.destroy();
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
                    page.setAttribute('data-original-page', i);
                    page.setAttribute('data-page-number', i);
                    page.textContent = `Page ${i}`;
                    sortableContainer.appendChild(page);
                }

                if (!sortable) {
                    sortable = new Sortable(sortableContainer, {
                        animation: 150,
                        ghostClass: 'sortable-ghost',
                        onEnd: function () {
                            // Update displayed numbers without changing original data
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

    // Parse page ranges (e.g. "1-3,5,7-9")
    function parsePageRanges(rangeStr, maxPage) {
        if (!rangeStr) return null;
        const ranges = [];
        const parts = rangeStr.split(',');

        for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed.includes('-')) {
                const [startStr, endStr] = trimmed.split('-').map(s => s.trim());
                const start = parseInt(startStr);
                const end = parseInt(endStr);

                if (isNaN(start)) continue;
                if (isNaN(end)) {
                    ranges.push({ start, end: start });
                } else {
                    ranges.push({ start, end });
                }
            } else {
                const page = parseInt(trimmed);
                if (!isNaN(page)) {
                    ranges.push({ start: page, end: page });
                }
            }
        }

        // Validate ranges
        const validRanges = ranges.filter(range =>
            range.start >= 1 &&
            range.end >= range.start &&
            range.end <= maxPage
        );

        return validRanges.length > 0 ? validRanges : null;
    }

    // Merge PDF handler
    async function handleMerge() {
        const fileInput = document.getElementById('merge-files');
        const files = fileInput.files;
        if (!files || files.length < 2) {
            alert('Please select at least 2 PDF files to merge.');
            return;
        }

        showProcessing(true);

        try {
            const { PDFDocument } = PDFLib;
            const mergedPdf = await PDFDocument.create();

            // Process files in order
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const fileBytes = await file.arrayBuffer();
                const pdfDoc = await PDFDocument.load(fileBytes);

                const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
                pages.forEach(page => mergedPdf.addPage(page));
            }

            const mergedPdfBytes = await mergedPdf.save();
            const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            openModal(url, 'Your merged PDF is ready to download!', 'merged.pdf');
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            showProcessing(false);
        }
    }

    // Split PDF handler
    async function handleSplit() {
        const file = document.getElementById('split-file').files[0];
        if (!file) {
            alert('Please select a PDF file to split.');
            return;
        }

        const splitByRange = document.getElementById('split-range').checked;
        showProcessing(true);

        try {
            const fileBytes = await file.arrayBuffer();
            const { PDFDocument } = PDFLib;
            const pdfDoc = await PDFDocument.load(fileBytes);
            const pageCount = pdfDoc.getPageCount();

            if (splitByRange) {
                const pagesInput = document.getElementById('split-pages').value.trim();
                if (!pagesInput) {
                    alert('Please enter page ranges to split by (e.g. 1-3, 5, 7-9).');
                    return;
                }

                const ranges = parsePageRanges(pagesInput, pageCount);
                if (!ranges || ranges.length === 0) {
                    alert('Invalid page range format.');
                    return;
                }

                // Create new PDF with selected pages
                const newPdf = await PDFDocument.create();
                for (const range of ranges) {
                    for (let i = range.start; i <= range.end; i++) {
                        const [page] = await newPdf.copyPages(pdfDoc, [i - 1]);
                        newPdf.addPage(page);
                    }
                }

                const newPdfBytes = await newPdf.save();
                const blob = new Blob([newPdfBytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);

                openModal(url, 'Your split PDF is ready to download!', `split_${file.name}`);
            } else {
                const interval = parseInt(document.getElementById('split-interval').value);
                if (isNaN(interval) || interval < 1) {
                    alert('Please enter a valid interval (1 or more).');
                    return;
                }

                const zip = new JSZip();
                let partNum = 1;

                for (let start = 0; start < pageCount; start += interval) {
                    const end = Math.min(start + interval, pageCount);
                    const partPdf = await PDFDocument.create();

                    for (let i = start; i < end; i++) {
                        const [page] = await partPdf.copyPages(pdfDoc, [i]);
                        partPdf.addPage(page);
                    }

                    const partBytes = await partPdf.save();
                    zip.file(`split_part_${partNum}_pages_${start + 1}-${end}.pdf`, partBytes);
                    partNum++;
                }

                const zipContent = await zip.generateAsync({ type: 'blob' });
                const url = URL.createObjectURL(zipContent);

                openModal(url, 'Your split PDF files are ready to download!', `split_${file.name.replace('.pdf', '')}_parts.zip`);
            }
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            showProcessing(false);
        }
    }

    // Remove pages handler
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

        try {
            const fileBytes = await file.arrayBuffer();
            const { PDFDocument } = PDFLib;
            const pdfDoc = await PDFDocument.load(fileBytes);
            const pageCount = pdfDoc.getPageCount();

            const ranges = parsePageRanges(pagesToRemove, pageCount);
            if (!ranges || ranges.length === 0) {
                alert('Invalid page range format.');
                return;
            }

            // Create set of pages to remove
            const pagesToRemoveSet = new Set();
            for (const range of ranges) {
                for (let i = range.start; i <= range.end; i++) {
                    pagesToRemoveSet.add(i - 1); // Convert to 0-based index
                }
            }

            // Create new PDF with remaining pages
            const newPdf = await PDFDocument.create();
            for (let i = 0; i < pageCount; i++) {
                if (!pagesToRemoveSet.has(i)) {
                    const [page] = await newPdf.copyPages(pdfDoc, [i]);
                    newPdf.addPage(page);
                }
            }

            const newPdfBytes = await newPdf.save();
            const blob = new Blob([newPdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            openModal(url, 'Your modified PDF with pages removed is ready to download!', `removed_pages_${file.name}`);
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            showProcessing(false);
        }
    }

    setupFileUpload('images-files', 'images-upload-area', 'images-preview', true);

    // Page size change handler
    document.getElementById('pdf-page-size').addEventListener('change', function () {
        const customSizeOption = document.getElementById('custom-size-option');
        if (this.value === 'Custom') {
            customSizeOption.style.display = 'flex';
        } else {
            customSizeOption.style.display = 'none';
        }
    });

    // Arrange pages handler
    async function handleArrange() {
        const file = document.getElementById('arrange-file').files[0];
        if (!file) {
            alert('Please select a PDF file to rearrange.');
            return;
        }

        // Get the current order from DOM elements (using original-page attribute)
        const pageElements = Array.from(sortableContainer.children);
        const newOrder = pageElements.map(el =>
            parseInt(el.getAttribute('data-original-page')) - 1
        );

        showProcessing(true);

        try {
            const fileBytes = await file.arrayBuffer();
            const { PDFDocument } = PDFLib;
            const pdfDoc = await PDFDocument.load(fileBytes);

            // Create new PDF with rearranged pages
            const newPdf = await PDFDocument.create();
            for (const pageIndex of newOrder) {
                const [page] = await newPdf.copyPages(pdfDoc, [pageIndex]);
                newPdf.addPage(page);
            }

            const newPdfBytes = await newPdf.save();
            const blob = new Blob([newPdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            openModal(url, 'Your PDF with rearranged pages is ready to download!', `rearranged_${file.name}`);
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            showProcessing(false);
        }
    }

    // Setup compression file upload
    setupFileUpload('compress-file', 'compress-upload-area', 'compress-preview', false);

    // Add event listener for compression button
    document.getElementById('compress-btn').addEventListener('click', handleCompress);

    // Image quality slider update
    document.getElementById('image-quality').addEventListener('input', function () {
        document.getElementById('quality-value').textContent = this.value + '%';
    });

    // Compression handler
    // Compression handler - Improved version
    async function handleCompress() {
        const file = document.getElementById('compress-file').files[0];
        if (!file) {
            alert('Please select a PDF file to compress.');
            return;
        }

        showProcessing(true);

        try {
            // Get compression settings
            const compressionLevel = document.getElementById('compression-level').value;
            const imageQuality = parseInt(document.getElementById('image-quality').value);
            const removeMetadata = document.getElementById('remove-metadata').checked;

            // Set quality based on compression level
            let jpegQuality;
            let scaleFactor;

            switch (compressionLevel) {
                case 'low':
                    jpegQuality = Math.max(0.7, imageQuality / 100);
                    scaleFactor = 1.0;
                    break;
                case 'medium':
                    jpegQuality = Math.max(0.5, imageQuality / 100 * 0.8);
                    scaleFactor = 0.9;
                    break;
                case 'high':
                    jpegQuality = Math.max(0.3, imageQuality / 100 * 0.6);
                    scaleFactor = 0.8;
                    break;
            }

            console.log(`Compressing with quality: ${jpegQuality}, scale: ${scaleFactor}`);

            // Load PDF using pdf.js for proper rendering
            const fileBytes = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({ data: fileBytes });
            const pdf = await loadingTask.promise;

            const { PDFDocument } = PDFLib;
            const newPdfDoc = await PDFDocument.create();

            let totalPages = pdf.numPages;
            console.log(`Processing ${totalPages} pages...`);

            // Process each page
            for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                try {
                    // Update processing message
                    updateProcessingMessage(`Processing page ${pageNum} of ${totalPages}...`);

                    // Get page from original PDF
                    const page = await pdf.getPage(pageNum);
                    const viewport = page.getViewport({ scale: 1.0 });

                    // Calculate scaled dimensions for compression
                    const scaledWidth = Math.floor(viewport.width * scaleFactor);
                    const scaledHeight = Math.floor(viewport.height * scaleFactor);

                    // Create canvas
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.width = scaledWidth;
                    canvas.height = scaledHeight;

                    // Set canvas background to white
                    context.fillStyle = 'white';
                    context.fillRect(0, 0, canvas.width, canvas.height);

                    // Render page to canvas with scaling
                    const renderContext = {
                        canvasContext: context,
                        viewport: page.getViewport({ scale: scaleFactor }),
                        background: 'white'
                    };

                    await page.render(renderContext).promise;

                    // Convert canvas to compressed JPEG with quality setting
                    let compressedImageData;
                    try {
                        compressedImageData = canvas.toDataURL('image/jpeg', jpegQuality);
                    } catch (e) {
                        // Fallback to PNG if JPEG fails
                        compressedImageData = canvas.toDataURL('image/png');
                    }

                    // Convert data URL to array buffer
                    const compressedResponse = await fetch(compressedImageData);
                    const compressedBlob = await compressedResponse.blob();
                    const compressedArrayBuffer = await compressedBlob.arrayBuffer();

                    // Embed compressed image in new PDF
                    let compressedImage;
                    try {
                        compressedImage = await newPdfDoc.embedJpg(compressedArrayBuffer);
                    } catch (e) {
                        // Fallback to PNG embedding
                        compressedImage = await newPdfDoc.embedPng(compressedArrayBuffer);
                    }

                    // Add page with original dimensions but compressed content
                    const newPage = newPdfDoc.addPage([viewport.width, viewport.height]);

                    // Draw compressed image scaled to fit original page size
                    newPage.drawImage(compressedImage, {
                        x: 0,
                        y: 0,
                        width: viewport.width,
                        height: viewport.height,
                    });

                    console.log(`Compressed page ${pageNum}`);

                    // Clean up
                    page.cleanup();

                } catch (pageError) {
                    console.error(`Error processing page ${pageNum}:`, pageError);
                    // Continue with next page even if one fails
                    continue;
                }
            }

            // Remove metadata if requested
            if (removeMetadata) {
                newPdfDoc.setTitle('Compressed PDF');
                newPdfDoc.setAuthor('');
                newPdfDoc.setSubject('');
                newPdfDoc.setKeywords([]);
                newPdfDoc.setProducer('');
                newPdfDoc.setCreator('');
                newPdfDoc.setCreationDate(new Date());
                newPdfDoc.setModificationDate(new Date());
            }

            // Save with optimized settings
            const compressedPdfBytes = await newPdfDoc.save({
                useObjectStreams: true,
                addDefaultPage: false,
                objectsPerTick: 100,
                updateFieldAppearances: false
            });

            const blob = new Blob([compressedPdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            // Calculate compression ratio
            const originalSize = file.size;
            const compressedSize = blob.size;
            const compressionRatio = compressedSize < originalSize ?
                ((originalSize - compressedSize) / originalSize * 100).toFixed(1) : 0;

            let message;
            if (compressedSize < originalSize) {
                message = `✅ PDF compressed successfully!\n\nSize reduced by ${compressionRatio}%\n${formatFileSize(originalSize)} → ${formatFileSize(compressedSize)}\n\nQuality setting: ${compressionLevel.toUpperCase()}`;
            } else {
                message = `📄 PDF processed.\n\nFinal size: ${formatFileSize(compressedSize)}\n\nNote: This PDF may already be optimized or contain minimal compressible content.`;
            }

            openModal(url, message, `compressed_${file.name}`);

            // Clean up
            pdf.destroy();

        } catch (error) {
            console.error('Compression error:', error);
            alert(`❌ Compression failed:\n${error.message}\n\nPlease try a different PDF file.`);
        } finally {
            showProcessing(false);
        }
    }

    // Helper function to update processing message
    function updateProcessingMessage(message) {
        const processingOverlay = document.getElementById('processing-overlay');
        if (processingOverlay) {
            const messageElement = processingOverlay.querySelector('p');
            if (messageElement) {
                messageElement.textContent = message;
            }
        }
    }

    // Enhanced processing overlay with progress
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
                overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
                overlay.style.display = 'flex';
                overlay.style.flexDirection = 'column';
                overlay.style.justifyContent = 'center';
                overlay.style.alignItems = 'center';
                overlay.style.zIndex = '10000';
                overlay.style.color = 'white';
                overlay.style.fontFamily = 'Arial, sans-serif';
                overlay.innerHTML = `
                <div style="text-align: center;">
                    <i class="fas fa-compress-alt fa-spin" style="font-size: 3rem; margin-bottom: 20px; color: var(--primary-color);"></i>
                    <h2 style="margin-bottom: 10px;">Compressing PDF...</h2>
                    <p style="margin-bottom: 20px;">This may take a moment for large files</p>
                    <div style="width: 200px; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; overflow: hidden;">
                        <div id="progress-bar" style="height: 100%; background: var(--primary-color); width: 0%; transition: width 0.3s;"></div>
                    </div>
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
