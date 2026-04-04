// ═══ 노트(메모/사진) 모듈 ═══

/**
 * 사진 파일 선택 시 Canvas 압축 후 미리보기 렌더링
 * @param {HTMLInputElement} input
 */
function previewPhoto(input) {
    localPhotoDataUrls = [];
    const preview = document.getElementById('localPhotoPreview');
    preview.innerHTML = '';
    if (!input.files || input.files.length === 0) return;

    Array.from(input.files).forEach(file => {
        const now    = new Date();
        const stamp  = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0')
        ].join('') + '_' + [
            String(now.getHours()).padStart(2, '0'),
            String(now.getMinutes()).padStart(2, '0'),
            String(now.getSeconds()).padStart(2, '0')
        ].join('');
        const fname  = stamp + '_' + file.name;

        const reader = new FileReader();
        reader.onload = ev => {
            const rawImg    = new Image();
            rawImg.onload   = () => {
                // Canvas 압축: 최대 480px, JPEG quality 0.45
                const MAX = 480;
                let w = rawImg.width, h = rawImg.height;
                if (w > MAX || h > MAX) {
                    if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
                    else        { w = Math.round(w * MAX / h); h = MAX; }
                }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(rawImg, 0, 0, w, h);
                const compressed = canvas.toDataURL('image/jpeg', 0.45);

                localPhotoDataUrls.push({ data: compressed, name: fname });

                const thumb   = document.createElement('img');
                thumb.src     = compressed;
                thumb.title   = fname;
                preview.appendChild(thumb);
            };
            rawImg.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });
}

/**
 * 기록(상태변경/메모/사진) 저장 → Google Apps Script WebApp으로 POST
 */
async function saveNote() {
    if (!currentSelectedId) return;

    const status = document.getElementById('localStatusSelect').value;
    const memo   = document.getElementById('localMemoInput').value.trim();
    if (!status && !memo && localPhotoDataUrls.length === 0) {
        showNotification('상태, 메모, 사진 중 하나 이상 입력하세요.', 'error');
        return;
    }

    const note = {
        itemId: currentSelectedId,
        id:     Date.now(),
        status: status || null,
        memo:   memo   || null,
        photos: [...localPhotoDataUrls],
        date:   new Date().toLocaleString('ko-KR')
    };

    const saveBtn      = document.querySelector('.note-save-btn');
    const originalHtml = saveBtn.innerHTML;
    saveBtn.innerHTML  = '<i class="fas fa-spinner fa-spin"></i> 저장 중...';
    saveBtn.disabled   = true;

    try {
        const saveResp = await fetch(GOOGLE_WEBAPP_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'text/plain' },
            body:    JSON.stringify({ action: 'addNote', note })
        });
        if (!saveResp.ok) throw new Error('서버 오류: ' + saveResp.status);
        const saveResult = await saveResp.json();
        if (saveResult?.error) throw new Error(saveResult.error);
    } catch (e) {
        console.error('Sheet save failed:', e);
        showNotification('저장 실패: ' + e.message, 'error');
        saveBtn.innerHTML = originalHtml;
        saveBtn.disabled  = false;
        return;
    }

    saveBtn.innerHTML = originalHtml;
    saveBtn.disabled  = false;

    // 상태 변경 시 로컬 데이터 즉시 반영
    if (status) {
        const item = inventoryData.find(i => i.id === currentSelectedId);
        if (item) {
            item.status = status;
            const tag = document.getElementById('currentStatusTag');
            if (tag) { tag.className = `status-tag ${getStatusClass(status)}`; tag.innerText = status; }
            renderInventory();
            updateStats();
            initDashboard();
        }
    }

    // 입력 필드 초기화
    document.getElementById('localStatusSelect').value   = '';
    document.getElementById('localMemoInput').value      = '';
    document.getElementById('localPhotoInput').value     = '';
    document.getElementById('localPhotoPreview').innerHTML = '';

    // pendingNotes에 등록 (gviz 캐시 반영 전 즉시 UI 표시용)
    const pendingNote = {
        itemId: note.itemId,
        id:     note.id,
        status: note.status || '',
        memo:   note.memo   || '',
        photos: [...note.photos],
        date:   note.date
    };
    if (!pendingNotes[currentSelectedId]) pendingNotes[currentSelectedId] = [];
    pendingNotes[currentSelectedId].push(pendingNote);

    localPhotoDataUrls = [];
    showNotification('기록이 저장되었습니다.', 'success');
    await renderNotes(currentSelectedId);
}

/**
 * localStorage에서 노트 카운트 조회
 * @param {number} id - 장비 ID
 * @returns {number}
 */
function getNoteCount(id) {
    return parseInt(localStorage.getItem(`noteCount_${id}`)) || 0;
}

/**
 * localStorage에서 로컬 노트 조회 (레거시 호환)
 * @param {number} id
 * @returns {Array}
 */
function getLocalNotes(id) {
    try   { return JSON.parse(localStorage.getItem(`notes_${id}`)) || []; }
    catch { return []; }
}

/**
 * 노트 삭제 (서버 및 로컬 상태)
 * @param {number} itemId
 * @param {number} noteId
 */
async function deleteNote(itemId, noteId) {
    if (!confirm('정말로 이 기록을 삭제할까요?')) return;

    try {
        const delResp = await fetch(GOOGLE_WEBAPP_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'text/plain' },
            body:    JSON.stringify({ action: 'deleteNote', itemId, noteId })
        });
        if (!delResp.ok) throw new Error('서버 오류: ' + delResp.status);
        const delResult = await delResp.json();
        if (delResult?.error) throw new Error(delResult.error);
    } catch (e) {
        console.error('Sheet delete failed:', e);
        showNotification('삭제 실패: ' + e.message, 'error');
        return;
    }

    // 즉시 UI에서 제거 (gviz 캐시 반영 전)
    deletedNoteIds.add(String(noteId));
    if (pendingNotes[itemId]) {
        pendingNotes[itemId] = pendingNotes[itemId].filter(n => String(n.id) !== String(noteId));
    }
    await renderNotes(itemId);
    renderInventory();
}

/**
 * 모달 내 저장된 기록 목록 렌더링 (1단계: 텍스트 즉시, 2단계: 사진 백그라운드)
 * @param {number} id - 장비 ID
 */
async function renderNotes(id) {
    const area = document.getElementById('notesHistoryArea');
    if (!area) return;

    // 1단계: 사진 제외 텍스트 노트 빠르게 조회
    let sheetNotes = [];
    try {
        const res = await fetch(GOOGLE_WEBAPP_URL + '?action=getNotes&itemId=' + encodeURIComponent(id));
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
                sheetNotes = data.filter(n => n.itemId != null && String(n.itemId) === String(id));
            }
        }
    } catch (e) { console.warn('Notes fetch failed:', e); }

    sheetNotes = sheetNotes.filter(n => !deletedNoteIds.has(String(n.id)));
    const sheetNoteIds = new Set(sheetNotes.map(n => String(n.id)));

    const pending = (pendingNotes[id] || []).filter(
        pn => !sheetNotes.some(sn => String(sn.id) === String(pn.id)) && !deletedNoteIds.has(String(pn.id))
    );
    const notes = [...sheetNotes, ...pending];

    localStorage.setItem(`noteCount_${id}`, notes.length);
    if (notes.length === 0) { area.innerHTML = ''; return; }

    const items = notes.slice().sort((a, b) => b.id - a.id).map(note => {
        const statusHtml = note.status
            ? `<span class="status-tag ${getStatusClass(note.status)}" style="font-size:10.5px;">${escapeHtml(note.status)}</span>`
            : '';
        const memoHtml   = note.memo
            ? `<div class="note-memo">${escapeHtml(note.memo)}</div>`
            : '';

        let photosHtml;
        if (sheetNoteIds.has(String(note.id))) {
            // 시트 노트: 사진 플레이스홀더 (백그라운드로 채워짐)
            photosHtml = `<div class="note-photos-area" data-noteid="${note.id}"></div>`;
        } else {
            // pending 노트: 방금 저장, 즉시 표시
            photosHtml = note.photos?.length > 0
                ? `<div class="note-photos-area" data-noteid="${note.id}">
                       <div class="note-photos">
                           ${note.photos.map(p => {
                               const src  = (p && typeof p === 'object') ? (p.data || '') : (p || '');
                               const name = (p && typeof p === 'object') ? (p.name || '') : '';
                               return src ? `<img src="${src}" onclick="showImageModal(this.src)" title="${escapeHtml(name) || '클릭하면 크게 보기'}">` : '';
                           }).filter(Boolean).join('')}
                       </div>
                   </div>`
                : `<div class="note-photos-area" data-noteid="${note.id}"></div>`;
        }

        return `
            <div class="note-item">
                <div class="note-item-header">
                    <div style="display:flex;align-items:center;gap:6px;">${statusHtml}</div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span class="note-date">${escapeHtml(note.date)}</span>
                        <button class="note-del-btn" onclick="deleteNote(${id},${note.id})" title="삭제">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                ${memoHtml}${photosHtml}
            </div>`;
    }).join('');

    area.innerHTML = `
        <div class="notes-list">
            <div class="note-title" style="margin-top:18px; padding-top:18px; border-top:1.5px dashed #e8edf5;">
                <i class="fas fa-history"></i> 저장된 기록 (${notes.length}건)
            </div>
            ${items}
        </div>`;

    // 2단계: 사진만 백그라운드로 조회하여 플레이스홀더에 채우기
    if (sheetNotes.length > 0) {
        loadPhotosInBackground(id);
    }
}

/**
 * 사진 데이터를 백그라운드에서 로드하여 플레이스홀더에 주입
 * @param {number} id - 장비 ID
 */
async function loadPhotosInBackground(id) {
    try {
        const res = await fetch(
            GOOGLE_WEBAPP_URL + '?action=getNotes&itemId=' + encodeURIComponent(id) + '&includePhotos=true'
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data)) return;

        data.forEach(note => {
            const area = document.querySelector(`.note-photos-area[data-noteid="${note.id}"]`);
            if (!area || !note.photos?.length) return;
            const imgs = note.photos.map(p => {
                const src  = (p && typeof p === 'object') ? (p.data || '') : (p || '');
                const name = (p && typeof p === 'object') ? (p.name || '') : '';
                return src ? `<img src="${src}" onclick="showImageModal(this.src)" title="${escapeHtml(name) || '클릭하면 크게 보기'}">` : '';
            }).filter(Boolean).join('');
            if (imgs) area.innerHTML = `<div class="note-photos">${imgs}</div>`;
        });
    } catch (e) { console.warn('Photo background load failed:', e); }
}
