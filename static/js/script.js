document.addEventListener('DOMContentLoaded', function () {
    // تعريف العناصر المشتركة
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');

    // تهيئة السنة الحالية في الفوتر
    document.getElementById('currentYear').textContent = new Date().getFullYear();

    // تبديل بين علامات التبويب
    const tabButtons = document.querySelectorAll('.tab-btn');
    const toolSections = document.querySelectorAll('.tool-section');

    tabButtons.forEach(button => {
        button.addEventListener('click', function () {
            const targetTab = this.getAttribute('data-tab');

            // تحديث الأزرار النشطة
            tabButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');

            // تحديث الأقسام النشطة
            toolSections.forEach(section => section.classList.remove('active-tool'));
            document.getElementById(targetTab).classList.add('active-tool');
        });
    });

    // ==============================================
    // قسم تقسيم PDF
    // ==============================================
    const splitDropArea = document.getElementById('splitDropArea');
    const splitFileInput = document.getElementById('splitFileInput');
    const selectSplitFileBtn = document.getElementById('selectSplitFile');
    const splitFileInfo = document.getElementById('splitFileInfo');
    const splitFileName = document.getElementById('splitFileName');
    const splitFileSize = document.getElementById('splitFileSize');
    const splitPageCount = document.getElementById('splitPageCount');
    const changeSplitFileBtn = document.getElementById('changeSplitFile');
    const splitOptions = document.getElementById('splitOptions');
    const splitMethodRange = document.getElementById('splitMethodRange');
    const splitMethodInterval = document.getElementById('splitMethodInterval');
    const pageRange = document.getElementById('pageRange');
    const pagesPerSplit = document.getElementById('pagesPerSplit');
    const previewSplitBtn = document.getElementById('previewSplit');
    const splitPreviewSection = document.getElementById('splitPreviewSection');
    const splitPreviewResults = document.getElementById('splitPreviewResults');
    const backToSplitOptionsBtn = document.getElementById('backToSplitOptions');

    // بيانات تقسيم PDF
    let currentSplitFile = null;
    let splitTotalPages = 0;
    let splitFileId = null;

    // أحداث سحب وإسقاط ملفات في قسم التقسيم
    splitDropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        splitDropArea.style.backgroundColor = '#f0f7ff';
    });

    splitDropArea.addEventListener('dragleave', () => {
        splitDropArea.style.backgroundColor = '';
    });

    splitDropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        splitDropArea.style.backgroundColor = '';
        if (e.dataTransfer.files.length > 0) {
            handleSplitFile(e.dataTransfer.files[0]);
        }
    });

    // أحداث أزرار قسم التقسيم
    selectSplitFileBtn.addEventListener('click', () => splitFileInput.click());
    splitFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleSplitFile(e.target.files[0]);
        }
    });

    changeSplitFileBtn.addEventListener('click', resetSplitTool);

    splitMethodRange.addEventListener('change', () => {
        pageRange.disabled = false;
        pagesPerSplit.disabled = true;
    });

    splitMethodInterval.addEventListener('change', () => {
        pageRange.disabled = true;
        pagesPerSplit.disabled = false;
    });

    previewSplitBtn.addEventListener('click', previewAndSplit);
    backToSplitOptionsBtn.addEventListener('click', () => {
        splitPreviewSection.classList.add('hidden');
        splitOptions.classList.remove('hidden');
    });

    // وظائف قسم التقسيم
    function handleSplitFile(file) {
        if (file.type !== 'application/pdf') {
            showToast('الرجاء اختيار ملف PDF فقط', 'error');
            return;
        }

        currentSplitFile = file;
        showLoading('جاري رفع الملف...');

        // رفع الملف إلى الخادم
        const formData = new FormData();
        formData.append('file', file);

        fetch('/upload', {
            method: 'POST',
            body: formData
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error('فشل في رفع الملف');
                }
                return response.json();
            })
            .then(data => {
                hideLoading();

                if (data.error) {
                    showToast(data.error, 'error');
                    return;
                }

                // حفظ معرف الملف للاستخدام لاحقاً
                splitFileId = data.id;
                splitTotalPages = data.pages;

                // عرض معلومات الملف
                splitFileName.textContent = data.name;
                splitFileSize.textContent = formatFileSize(data.size);
                splitPageCount.textContent = `عدد الصفحات: ${data.pages}`;

                // عرض خيارات التقسيم
                splitFileInfo.classList.remove('hidden');
                splitOptions.classList.remove('hidden');
                splitDropArea.classList.add('hidden');
            })
            .catch(error => {
                hideLoading();
                showToast('تعذر رفع الملف: ' + error.message, 'error');
                console.error(error);
            });
    }

    // دمج وظيفتي المعاينة والتقسيم في وظيفة واحدة
    function previewAndSplit() {
        if (!currentSplitFile || !splitFileId) {
            showToast('الرجاء رفع ملف أولاً', 'error');
            return;
        }

        let ranges = [];
        if (splitMethodRange.checked) {
            const rangeText = pageRange.value.trim();
            if (!rangeText) {
                showToast('الرجاء إدخال نطاق الصفحات', 'error');
                return;
            }

            ranges = parsePageRanges(rangeText, splitTotalPages);
            if (ranges.length === 0) {
                showToast('نطاق الصفحات غير صحيح', 'error');
                return;
            }
        } else {
            const interval = parseInt(pagesPerSplit.value);
            if (isNaN(interval) || interval < 1 || interval > splitTotalPages) {
                showToast('عدد الصفحات لكل جزء غير صحيح', 'error');
                return;
            }

            for (let i = 0; i < splitTotalPages; i += interval) {
                const start = i + 1;
                const end = Math.min(i + interval, splitTotalPages);
                ranges.push({ start, end });
            }
        }

        // عرض التحميل
        showLoading('جاري تحضير المعاينة وتقسيم الملف...');

        // أولاً: عرض المعاينة
        splitPreviewResults.innerHTML = '';

        // إرسال طلب التقسيم إلى الخادم
        fetch('/split', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                file_id: splitFileId,
                ranges: ranges
            })
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error('فشل في تقسيم الملف');
                }
                return response.json();
            })
            .then(data => {
                hideLoading();

                if (data.error) {
                    showToast(data.error, 'error');
                    return;
                }

                // عرض النتائج في قسم المعاينة
                data.parts.forEach((part) => {
                    const item = document.createElement('div');
                    item.className = 'result-item';
                    item.innerHTML = `
                    <div class="result-item-info">
                        <i class="fas fa-file-pdf"></i>
                        <div>
                            <div class="result-item-name">${part.name}</div>
                            <div class="result-item-range">الصفحات ${part.pages}</div>
                        </div>
                    </div>
                    <div class="result-item-actions">
                        <span class="result-item-size">${formatFileSize(part.size)}</span>
                        <button class="action-btn download-btn" data-filename="${part.name}">
                            <i class="fas fa-download"></i> تحميل
                        </button>
                    </div>
                `;
                    splitPreviewResults.appendChild(item);
                });

                // إضافة أحداث التحميل
                document.querySelectorAll('.download-btn').forEach(btn => {
                    btn.addEventListener('click', function () {
                        const filename = this.getAttribute('data-filename');
                        downloadFile(filename);
                    });
                });

                // إظهار قسم المعاينة (الذي يحتوي الآن على أزرار تحميل)
                splitOptions.classList.add('hidden');
                splitPreviewSection.classList.remove('hidden');
            })
            .catch(error => {
                hideLoading();
                showToast('تعذر تقسيم الملف: ' + error.message, 'error');
                console.error(error);
            });
    }

    function resetSplitTool() {
        currentSplitFile = null;
        splitTotalPages = 0;
        splitFileId = null;
        splitFileInput.value = '';

        splitFileInfo.classList.add('hidden');
        splitOptions.classList.add('hidden');
        splitPreviewSection.classList.add('hidden');
        splitDropArea.classList.remove('hidden');
    }

    // ==============================================
    // قسم دمج PDF
    // ==============================================
    const mergeDropArea = document.getElementById('mergeDropArea');
    const mergeFilesInput = document.getElementById('mergeFilesInput');
    const selectMergeFilesBtn = document.getElementById('selectMergeFiles');
    const mergeContainer = document.getElementById('mergeContainer');
    const mergeFilesList = document.getElementById('mergeFilesList');
    const addMoreFilesBtn = document.getElementById('addMoreFiles');
    const clearMergeFilesBtn = document.getElementById('clearMergeFiles');
    const mergePDFsBtn = document.getElementById('mergePDFs');
    const mergeResultSection = document.getElementById('mergeResultSection');
    const mergedFileName = document.getElementById('mergedFileName');
    const mergedFileSize = document.getElementById('mergedFileSize');
    const mergedPageCount = document.getElementById('mergedPageCount');
    const downloadMergedBtn = document.getElementById('downloadMerged');
    const newMergeBtn = document.getElementById('newMerge');

    // بيانات دمج PDF
    let mergeFiles = [];
    let mergedFileId = null;

    // أحداث سحب وإسقاط ملفات في قسم الدمج
    mergeDropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        mergeDropArea.style.backgroundColor = '#f0f7ff';
    });

    mergeDropArea.addEventListener('dragleave', () => {
        mergeDropArea.style.backgroundColor = '';
    });

    mergeDropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        mergeDropArea.style.backgroundColor = '';
        if (e.dataTransfer.files.length > 0) {
            handleMergeFiles(Array.from(e.dataTransfer.files));
        }
    });

    // أحداث أزرار قسم الدمج
    selectMergeFilesBtn.addEventListener('click', () => mergeFilesInput.click());
    mergeFilesInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleMergeFiles(Array.from(e.target.files));
        }
    });

    addMoreFilesBtn.addEventListener('click', () => mergeFilesInput.click());
    clearMergeFilesBtn.addEventListener('click', resetMergeTool);
    mergePDFsBtn.addEventListener('click', mergeSelectedPDFs);
    newMergeBtn.addEventListener('click', resetMergeTool);
    downloadMergedBtn.addEventListener('click', () => {
        if (mergedFileId) {
            const filename = mergedFileName.textContent.trim();
            downloadFile(filename);
        }
    });

    // إعداد ميزة السحب والإفلات لإعادة ترتيب الملفات
    new Sortable(mergeFilesList, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: function (evt) {
            const oldIndex = evt.oldIndex;
            const newIndex = evt.newIndex;

            // إعادة ترتيب مصفوفة الملفات
            if (oldIndex !== newIndex) {
                const item = mergeFiles.splice(oldIndex, 1)[0];
                mergeFiles.splice(newIndex, 0, item);
            }
        }
    });

    // وظائف قسم الدمج
    function handleMergeFiles(files) {
        // تصفية الملفات للتأكد من أنها PDF فقط
        const pdfFiles = files.filter(file => file.type === 'application/pdf');

        if (pdfFiles.length === 0) {
            showToast('الرجاء اختيار ملفات PDF فقط', 'error');
            return;
        }

        if (files.length !== pdfFiles.length) {
            showToast('تم تجاهل بعض الملفات لأنها ليست بتنسيق PDF', 'warning');
        }

        showLoading(`جاري رفع ${pdfFiles.length} ${pdfFiles.length === 1 ? 'ملف' : 'ملفات'}...`);

        // إنشاء FormData وإضافة الملفات
        const formData = new FormData();
        pdfFiles.forEach(file => {
            formData.append('files[]', file);
        });

        // رفع الملفات إلى الخادم
        fetch('/upload-multiple', {
            method: 'POST',
            body: formData
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error('فشل في رفع الملفات');
                }
                return response.json();
            })
            .then(data => {
                hideLoading();

                if (data.error) {
                    showToast(data.error, 'error');
                    return;
                }

                // إضافة الملفات إلى القائمة
                mergeFiles = [...mergeFiles, ...data.files];

                // تحديث واجهة المستخدم
                updateMergeFilesList();

                // إظهار قسم الدمج
                mergeContainer.classList.remove('hidden');
                mergeDropArea.classList.add('hidden');
            })
            .catch(error => {
                hideLoading();
                showToast('تعذر رفع الملفات: ' + error.message, 'error');
                console.error(error);
            });
    }

    function initializeSortable() {
        new Sortable(mergeFilesList, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            handle: '.drag-handle', // تحديد العنصر الذي يُستخدم للسحب
            onEnd: function (evt) {
                const oldIndex = evt.oldIndex;
                const newIndex = evt.newIndex;

                // إعادة ترتيب مصفوفة الملفات
                if (oldIndex !== newIndex) {
                    const item = mergeFiles.splice(oldIndex, 1)[0];
                    mergeFiles.splice(newIndex, 0, item);
                    updateMergeFilesList(); // تحديث الواجهة بعد التغيير
                }
            }
        });
    }

    function updateMergeFilesList() {
        mergeFilesList.innerHTML = '';

        if (mergeFiles.length === 0) {
            mergeContainer.classList.add('hidden');
            mergeDropArea.classList.remove('hidden');
            return;
        }

        mergeFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'result-item';
            item.innerHTML = `
            <div class="result-item-info">
                <div class="drag-handle"><i class="fas fa-grip-lines"></i></div>
                <i class="fas fa-file-pdf"></i>
                <div>
                    <div class="result-item-name">${file.name}</div>
                    <div class="result-item-details">الصفحات: ${file.pages}</div>
                </div>
            </div>
            <div class="result-item-actions">
                <span class="result-item-size">${formatFileSize(file.size)}</span>
                <button class="action-btn remove-file-btn" data-index="${index}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
            mergeFilesList.appendChild(item);
        });

        // تهيئة Sortable بعد تحديث القائمة
        initializeSortable();

        // إضافة أحداث أزرار الحذف
        document.querySelectorAll('.remove-file-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const index = parseInt(this.getAttribute('data-index'));
                mergeFiles.splice(index, 1);
                updateMergeFilesList();
            });
        });

        // تحديث تمكين/تعطيل زر الدمج
        mergePDFsBtn.disabled = mergeFiles.length < 2;
    }

    function mergeSelectedPDFs() {
        if (mergeFiles.length < 2) {
            showToast('يجب اختيار ملفين على الأقل للدمج', 'error');
            return;
        }

        showLoading('جاري دمج الملفات...');

        // إرسال طلب الدمج إلى الخادم
        fetch('/merge', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                file_ids: mergeFiles.map(file => file.id)
            })
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error('فشل في دمج الملفات');
                }
                return response.json();
            })
            .then(data => {
                hideLoading();

                if (data.error) {
                    showToast(data.error, 'error');
                    return;
                }

                // حفظ معلومات الملف المدمج
                mergedFileId = data.id;
                mergedFileName.textContent = data.name;
                mergedFileSize.textContent = formatFileSize(data.size);
                mergedPageCount.textContent = `عدد الصفحات: ${data.pages}`;

                // إظهار قسم النتائج
                mergeContainer.classList.add('hidden');
                mergeResultSection.classList.remove('hidden');
            })
            .catch(error => {
                hideLoading();
                showToast('تعذر دمج الملفات: ' + error.message, 'error');
                console.error(error);
            });
    }

    function resetMergeTool() {
        mergeFiles = [];
        mergedFileId = null;
        mergeFilesInput.value = '';

        mergeContainer.classList.add('hidden');
        mergeResultSection.classList.add('hidden');
        mergeDropArea.classList.remove('hidden');
    }

    // ==============================================
    // قسم إزالة الصفحات
    // ==============================================
    const removeDropArea = document.getElementById('removeDropArea');
    const removeFileInput = document.getElementById('removeFileInput');
    const selectRemoveFileBtn = document.getElementById('selectRemoveFile');
    const removeFileInfo = document.getElementById('removeFileInfo');
    const removeFileName = document.getElementById('removeFileName');
    const removeFileSize = document.getElementById('removeFileSize');
    const removePageCount = document.getElementById('removePageCount');
    const changeRemoveFileBtn = document.getElementById('changeRemoveFile');
    const removeOptions = document.getElementById('removeOptions');
    const pagesToRemove = document.getElementById('pagesToRemove');
    const processRemoveBtn = document.getElementById('processRemove');
    const removeResultSection = document.getElementById('removeResultSection');
    const removedFileName = document.getElementById('removedFileName');
    const removedFileSize = document.getElementById('removedFileSize');
    const removedPageCount = document.getElementById('removedPageCount');
    const downloadRemovedBtn = document.getElementById('downloadRemoved');
    const newRemoveBtn = document.getElementById('newRemove');

    let currentRemoveFile = null;
    let removeFileId = null;
    let removeTotalPages = 0;

    // أحداث السحب والإسقاط
    removeDropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        removeDropArea.style.backgroundColor = '#f0f7ff';
    });

    removeDropArea.addEventListener('dragleave', () => {
        removeDropArea.style.backgroundColor = '';
    });

    removeDropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        removeDropArea.style.backgroundColor = '';
        if (e.dataTransfer.files.length > 0) {
            handleRemoveFile(e.dataTransfer.files[0]);
        }
    });

    // أحداث الأزرار
    selectRemoveFileBtn.addEventListener('click', () => removeFileInput.click());
    removeFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleRemoveFile(e.target.files[0]);
        }
    });

    changeRemoveFileBtn.addEventListener('click', resetRemoveTool);
    processRemoveBtn.addEventListener('click', processRemovePages);
    newRemoveBtn.addEventListener('click', resetRemoveTool);
    downloadRemovedBtn.addEventListener('click', () => {
        const filename = removedFileName.textContent.trim();
        if (filename) downloadFile(filename);
    });

    function handleRemoveFile(file) {
        if (file.type !== 'application/pdf') {
            showToast('الرجاء اختيار ملف PDF فقط', 'error');
            return;
        }

        currentRemoveFile = file;
        showLoading('جاري رفع الملف...');

        const formData = new FormData();
        formData.append('file', file);

        fetch('/upload', {
            method: 'POST',
            body: formData
        })
            .then(response => response.json())
            .then(data => {
                if (data.error) throw new Error(data.error);

                removeFileId = data.id;
                removeTotalPages = data.pages;

                removeFileName.textContent = data.name;
                removeFileSize.textContent = formatFileSize(data.size);
                removePageCount.textContent = `عدد الصفحات: ${data.pages}`;

                removeFileInfo.classList.remove('hidden');
                removeOptions.classList.remove('hidden');
                removeDropArea.classList.add('hidden');
            })
            .catch(error => {
                showToast('تعذر رفع الملف: ' + error.message, 'error');
            })
            .finally(hideLoading);
    }

    function processRemovePages() {
        const pagesInput = pagesToRemove.value.trim();
        if (!pagesInput) {
            showToast('الرجاء إدخال الصفحات المراد إزالتها', 'error');
            return;
        }

        const pages = parsePageNumbers(pagesInput, removeTotalPages);
        if (pages.length === 0) {
            showToast('تنسيق الصفحات غير صحيح', 'error');
            return;
        }

        showLoading('جاري إزالة الصفحات...');

        fetch('/remove-pages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_id: removeFileId,
                pages: pages
            })
        })
            .then(response => response.json())
            .then(data => {
                if (data.error) throw new Error(data.error);

                removedFileName.textContent = data.name;
                removedFileSize.textContent = formatFileSize(data.size);
                removedPageCount.textContent = `عدد الصفحات: ${data.pages}`;

                removeOptions.classList.add('hidden');
                removeResultSection.classList.remove('hidden');
            })
            .catch(error => {
                showToast('تعذر الإزالة: ' + error.message, 'error');
            })
            .finally(hideLoading);
    }

    function parsePageNumbers(input, maxPage) {
        const pages = new Set();
        const parts = input.split(',');

        for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed.includes('-')) {
                const [start, end] = trimmed.split('-').map(Number);
                if (isNaN(start) || isNaN(end) || start > end || end > maxPage) continue;
                for (let i = start; i <= end; i++) pages.add(i);
            } else {
                const page = Number(trimmed);
                if (!isNaN(page) && page <= maxPage) pages.add(page);
            }
        }
        return Array.from(pages);
    }

    function resetRemoveTool() {
        currentRemoveFile = null;
        removeFileId = null;
        removeFileInput.value = '';
        pagesToRemove.value = '';

        removeFileInfo.classList.add('hidden');
        removeOptions.classList.add('hidden');
        removeResultSection.classList.add('hidden');
        removeDropArea.classList.remove('hidden');
    }

    // ==============================================
    // قسم Scan to PDF
    // ==============================================
    const scanDropArea = document.getElementById('scanDropArea');
    const startScanBtn = document.getElementById('startScan');
    const cameraPreview = document.getElementById('cameraPreview');
    const scannerVideo = document.getElementById('scannerVideo');
    const captureBtn = document.getElementById('captureBtn');
    const addMoreScansBtn = document.getElementById('addMoreScans');
    const convertToPdfBtn = document.getElementById('convertToPdf');
    const scannedImages = document.getElementById('scannedImages');
    const scanResult = document.getElementById('scanResult');
    const scannedFileName = document.getElementById('scannedFileName');
    const scannedFileSize = document.getElementById('scannedFileSize');
    const scannedPageCount = document.getElementById('scannedPageCount');
    const downloadScannedBtn = document.getElementById('downloadScanned');
    const newScanBtn = document.getElementById('newScan');

    let mediaStream = null;
    let capturedImages = [];

    // أحداث قسم المسح
    startScanBtn.addEventListener('click', initCamera);
    captureBtn.addEventListener('click', captureImage);
    addMoreScansBtn.addEventListener('click', () => scannerVideo.classList.remove('hidden'));
    convertToPdfBtn.addEventListener('click', convertToPDF);
    newScanBtn.addEventListener('click', resetScanTool);
    downloadScannedBtn.addEventListener('click', () => {
        const filename = scannedFileName.textContent.trim();
        if (filename) downloadFile(filename);
    });

    async function initCamera() {
        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
            scannerVideo.srcObject = mediaStream;
            scanDropArea.classList.add('hidden');
            scanControls.classList.remove('hidden');
            scannerVideo.classList.remove('hidden');
        } catch (error) {
            showToast('تعذر الوصول إلى الكاميرا: ' + error.message, 'error');
        }
    }

    function captureImage() {
        const canvas = document.createElement('canvas');
        canvas.width = scannerVideo.videoWidth;
        canvas.height = scannerVideo.videoHeight;
        canvas.getContext('2d').drawImage(scannerVideo, 0, 0);

        const imageUrl = canvas.toDataURL('image/jpeg');
        capturedImages.push(imageUrl);

        // إضافة الصورة للمعاينة
        const imgElement = document.createElement('img');
        imgElement.src = imageUrl;
        imgElement.className = 'scanned-image';
        scannedImages.appendChild(imgElement);

        scannerVideo.classList.add('hidden');
        scannedPreview.classList.remove('hidden');
        showToast('تم التقاط الصورة بنجاح', 'success');
    }

    async function convertToPDF() {
        if (capturedImages.length === 0) {
            showToast('الرجاء التقاط صور أولاً', 'error');
            return;
        }

        showLoading('جاري تحويل الصور إلى PDF...');

        // تحويل الصور إلى ملفات FormData
        const formData = new FormData();
        capturedImages.forEach((dataUrl, index) => {
            const blob = dataURLtoBlob(dataUrl);
            formData.append('images[]', blob, `image_${index + 1}.jpg`);
        });

        try {
            const response = await fetch('/scan-to-pdf', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error);

            scannedFileName.textContent = data.name;
            scannedFileSize.textContent = formatFileSize(data.size);
            scannedPageCount.textContent = `عدد الصفحات: ${data.pages}`;

            scannedPreview.classList.add('hidden');
            scanResult.classList.remove('hidden');
        } catch (error) {
            showToast('تعذر التحويل: ' + error.message, 'error');
        } finally {
            hideLoading();
        }
    }

    function dataURLtoBlob(dataUrl) {
        const arr = dataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        return new Blob([u8arr], { type: mime });
    }

    function resetScanTool() {
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
        }
        mediaStream = null;
        capturedImages = [];
        scannedImages.innerHTML = '';
        scanResult.classList.add('hidden');
        scanControls.classList.add('hidden');
        scanDropArea.classList.remove('hidden');
        scannedPreview.classList.add('hidden');
    }

    // ... (بقية الدوال تبقى كما هي) ...

    // ==============================================
    // الوظائف المشتركة
    // ==============================================
    function downloadFile(filename) {
        // إنشاء رابط للتحميل المباشر من الخادم
        const downloadUrl = `/download/${filename}`;

        // فتح نافذة تحميل جديدة
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename; // اسم الملف عند التحميل
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        showToast(`جاري تحميل الملف ${filename}`, 'success');
    }

    function parsePageRanges(rangeText, maxPage) {
        const ranges = [];
        const parts = rangeText.split(',');

        for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;

            if (trimmed.includes('-')) {
                const [startStr, endStr] = trimmed.split('-');
                const start = parseInt(startStr);
                const end = parseInt(endStr);

                if (isNaN(start) || isNaN(end) || start < 1 || end > maxPage || start > end) {
                    return [];
                }

                ranges.push({ start, end });
            } else {
                const page = parseInt(trimmed);
                if (isNaN(page) || page < 1 || page > maxPage) {
                    return [];
                }

                ranges.push({ start: page, end: page });
            }
        }

        return ranges;
    }

    function showLoading(text) {
        loadingText.textContent = text;
        loadingOverlay.classList.remove('hidden');
    }

    function hideLoading() {
        loadingOverlay.classList.add('hidden');
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 ك.ب';
        const k = 1024;
        const sizes = ['ك.ب', 'م.ب', 'ج.ب'];

        if (bytes < k) {
            return bytes + ' بايت';
        } else if (bytes < Math.pow(k, 2)) {
            return parseFloat((bytes / k).toFixed(2)) + ' ' + sizes[0]; // كيلوبايت
        } else if (bytes < Math.pow(k, 3)) {
            return parseFloat((bytes / Math.pow(k, 2)).toFixed(2)) + ' ' + sizes[1]; // ميجابايت
        } else {
            return parseFloat((bytes / Math.pow(k, 3)).toFixed(2)) + ' ' + sizes[2]; // جيجابايت
        }
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 3000);
    }
});