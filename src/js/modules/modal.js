// ═══ 모달 모듈 ═══

// ── 장비 상세 모달 ────────────────────────────────────────────────────────────

/**
 * 장비 상세 모달 열기
 * @param {number} id - 장비 ID
 */
async function openModal(id) {
    currentSelectedId  = id;
    const item = inventoryData.find(i => i.id === id);
    if (!item) return;
    localPhotoDataUrls = [];

    document.getElementById('modalTitle').innerText    = item.name;
    document.getElementById('modalSubtitle').innerText = `${item.category} · ${item.department}`;

    document.getElementById('modalBody').innerHTML = `
        <div class="detail-grid">
            <div class="detail-item">
                <span class="dlabel">카테고리</span>
                <span class="dval">${item.category}</span>
            </div>
            <div class="detail-item">
                <span class="dlabel">현재 상태</span>
                <div class="dval dval-status-wrap">
                    <span id="currentStatusTag" class="status-tag ${getStatusClass(item.status)}">${item.status}</span>
                </div>
            </div>
            <div class="detail-item fw">
                <span class="dlabel">보관 / 사용 장소</span>
                <span class="dval"><i class="fas fa-location-dot" style="color:#cbd5e1;margin-right:6px;"></i>${item.location}</span>
            </div>
            <div class="detail-item">
                <span class="dlabel">사용자</span>
                <span class="dval">${item.user}</span>
            </div>
            <div class="detail-item">
                <span class="dlabel">부서</span>
                <span class="dval">${item.department}</span>
            </div>
            <div class="detail-item fw">
                <span class="dlabel">사용 목적</span>
                <span class="dval">${item.purpose}</span>
            </div>
            <div class="detail-item">
                <span class="dlabel">업데이트 날짜</span>
                <span class="dval">${item.date}</span>
            </div>
        </div>

        <div class="note-section">
            <div class="note-title"><i class="fas fa-pen-to-square"></i> 상태 변경 및 메모 기록</div>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="dlabel">상태 변경</span>
                    <select id="localStatusSelect" class="local-select">
                        <option value="">-- 상태 선택 (선택사항) --</option>
                        <option value="가용">가용</option>
                        <option value="대여중">대여중</option>
                        <option value="수리중">수리중</option>
                        <option value="문제발견">문제발견</option>
                        <option value="분실">분실</option>
                    </select>
                </div>
                <div class="detail-item fw">
                    <span class="dlabel">메모</span>
                    <textarea id="localMemoInput" class="local-textarea" placeholder="문제 사항, 전달 내용 등을 입력하세요..."></textarea>
                </div>
                <div class="detail-item fw">
                    <span class="dlabel">사진 첨부</span>
                    <label for="localPhotoInput" class="photo-label">
                        <i class="fas fa-camera"></i> 사진 선택 (여러 장 가능)
                    </label>
                    <input type="file" id="localPhotoInput" accept="image/*" multiple style="display:none;" onchange="previewPhoto(this)">
                    <div id="localPhotoPreview" class="photo-preview-area"></div>
                </div>
            </div>
            <button class="note-save-btn" onclick="saveNote()"><i class="fas fa-floppy-disk"></i> 기록 저장</button>
        </div>

        <div id="notesHistoryArea"></div>
    `;

    const returnBtn = document.getElementById('modalReturnBtn');
    if (returnBtn) {
        const isRental = (item.status || '').trim() === '대여중';
        returnBtn.disabled = false;
        returnBtn.innerHTML = '<i class="fas fa-rotate-left"></i> 반납하기';
        if (isRental) {
            returnBtn.removeAttribute('style');
        } else {
            returnBtn.style.display = 'none';
        }
    }

    const editBtn = document.getElementById('modalEditBtn');
    if (item.editUrl && item.editUrl !== '-' && item.editUrl !== '') {
        editBtn.href          = item.editUrl;
        editBtn.style.display = 'inline-flex';
    } else {
        editBtn.style.display = 'none';
    }

    document.getElementById('gearModal').classList.add('active');
    await renderNotes(id);
}

function closeModal() {
    document.getElementById('gearModal').classList.remove('active');
    currentSelectedId = null;
    const dangerBtn = document.querySelector('#gearModal .danger-btn');
    if (dangerBtn) dangerBtn.style.display = '';
}

/**
 * 대여중 장비를 즉시 가용 상태로 반납 처리
 */
async function returnItem() {
    if (!currentSelectedId) return;
    const item = inventoryData.find(i => i.id === currentSelectedId);
    if (!item) return;

    const returnBtn = document.getElementById('modalReturnBtn');
    const originalHtml = returnBtn.innerHTML;
    returnBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 처리 중...';
    returnBtn.disabled = true;

    const note = {
        itemId: currentSelectedId,
        id:     Date.now(),
        status: '가용',
        memo:   '반납 처리',
        photos: [],
        date:   new Date().toLocaleString('ko-KR'),
        itemMeta: {
            name:       item.name       || '',
            category:   item.category   || '',
            location:   item.location   || '',
            user:       item.user       || '',
            purpose:    item.purpose    || '',
            department: item.department || '',
            usageDate:  item.usageDate  || item.date || '',
            editUrl:    item.editUrl    || ''
        }
    };

    try {
        const resp = await fetch(GOOGLE_WEBAPP_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'text/plain' },
            body:    JSON.stringify({ action: 'addNote', note })
        });
        if (!resp.ok) throw new Error('서버 오류: ' + resp.status);
        const result = await resp.json();
        if (result?.error) throw new Error(result.error);
    } catch (e) {
        console.error('Return failed:', e);
        showNotification('반납 처리 실패: ' + e.message, 'error');
        returnBtn.innerHTML = originalHtml;
        returnBtn.disabled = false;
        return;
    }

    item.status = '가용';
    const tag = document.getElementById('currentStatusTag');
    if (tag) { tag.className = `status-tag ${getStatusClass('가용')}`; tag.innerText = '가용'; }

    returnBtn.style.display = 'none';

    if (!pendingNotes[currentSelectedId]) pendingNotes[currentSelectedId] = [];
    pendingNotes[currentSelectedId].push({
        itemId: note.itemId,
        id:     note.id,
        status: '가용',
        memo:   note.memo,
        photos: [],
        date:   note.date
    });

    renderInventory();
    updateStats();
    initDashboard();
    showNotification('반납 처리가 완료되었습니다.', 'success');
    await renderNotes(currentSelectedId);
}

// ── Google Form 모달 ──────────────────────────────────────────────────────────

function openFormModal(url = null) {
    document.getElementById('formIframe').src          = url || GOOGLE_FORM_URL;
    document.getElementById('formModalTitle').innerText = url ? '장비 상태 수정' : '새 장비 등록';
    document.getElementById('formModal').classList.add('active');
}

function closeFormModal() {
    document.getElementById('formModal').classList.remove('active');
    document.getElementById('formIframe').src = '';
    if (GOOGLE_SHEET_API && GOOGLE_SHEET_API.trim() !== '') fetchDataFromGS();
}

// ── 최근 7일 히스토리 모달 ────────────────────────────────────────────────────

/**
 * 헤더 히스토리 버튼 클릭 시 최근 7일간 History 시트 이력을 표시합니다.
 */
async function openHistoryModal() {
    const list = document.getElementById('historyList');
    list.innerHTML = `<div style="text-align:center;padding:36px 20px;color:var(--text-muted);">
        <i class="fas fa-spinner fa-spin" style="font-size:26px;margin-bottom:14px;display:block;color:var(--primary);"></i>
        최근 7일 이력을 불러오는 중...
    </div>`;
    document.getElementById('historyModal').classList.add('active');

    const data = await fetchWeeklyHistoryData();

    if (!data || data.length === 0) {
        list.innerHTML = `<div style="text-align:center;padding:36px 20px;color:var(--text-muted);">
            <i class="fas fa-clock-rotate-left" style="font-size:30px;margin-bottom:14px;display:block;opacity:0.35;"></i>
            <p style="font-size:13.5px;">최근 7일간 기록된 이력이 없습니다.</p>
        </div>`;
        document.getElementById('history-badge').innerText = '0';
        return;
    }

    document.getElementById('history-badge').innerText = data.length;

    list.innerHTML = data.map(item => {
        const icon  = getIconByCategory(item.category);
        const bgCls = item.category && item.category.includes('음향') ? 'speaker-bg'
                    : item.category && item.category.includes('영상') ? 'video-bg'
                    : item.category && item.category.includes('사진') ? 'camera-bg'
                    : 'default-bg';
        return `<div class="history-item">
            <div class="hist-icon ${bgCls}"><i class="fas ${icon}"></i></div>
            <div style="flex:1;min-width:0;">
                <div class="hist-name">${escapeHtml(item.name || '-')}</div>
                <div class="hist-meta">
                    ${escapeHtml(item.department || '')}
                    ${item.department && item.user ? ' · ' : ''}
                    ${escapeHtml(item.user || '')}
                    ${item.status ? ` · <span class="status-tag ${getStatusClass(item.status)}" style="font-size:10px;padding:1px 6px;">${escapeHtml(item.status)}</span>` : ''}
                </div>
                ${item.purpose ? `<div class="hist-meta" style="margin-top:2px;opacity:0.75;font-style:italic;">${escapeHtml(item.purpose)}</div>` : ''}
            </div>
            <div style="font-size:10.5px;color:var(--text-muted);white-space:nowrap;text-align:right;flex-shrink:0;padding-left:8px;">
                ${escapeHtml(item.timestamp || '')}
            </div>
        </div>`;
    }).join('');
}

function closeHistoryModal() {
    document.getElementById('historyModal').classList.remove('active');
}

// ── 이미지 확대 모달 ──────────────────────────────────────────────────────────

function showImageModal(src) {
    document.getElementById('modalImage').src = src;
    document.getElementById('imageModal').classList.add('active');
}

function closeImageModal() {
    document.getElementById('imageModal').classList.remove('active');
}
