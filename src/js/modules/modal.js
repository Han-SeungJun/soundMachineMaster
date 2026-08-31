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

    const statusTrimmed = (item.status || '').trim();
    const returnBtn = document.getElementById('modalReturnBtn');
    if (returnBtn) {
        returnBtn.disabled = false;
        returnBtn.innerHTML = '<i class="fas fa-rotate-left"></i> 반납하기';
        if (statusTrimmed === '대여중') { returnBtn.removeAttribute('style'); }
        else { returnBtn.style.display = 'none'; }
    }
    const rentBtn = document.getElementById('modalRentBtn');
    if (rentBtn) {
        rentBtn.disabled = false;
        rentBtn.innerHTML = '<i class="fas fa-right-from-bracket"></i> 대여하기';
        if (statusTrimmed === '가용') { rentBtn.removeAttribute('style'); }
        else { rentBtn.style.display = 'none'; }
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

    try {
        const resp = await fetch(GOOGLE_WEBAPP_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'text/plain' },
            body:    JSON.stringify({ action: 'updateItem', itemId: currentSelectedId, fields: { status: '가용' } })
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
    const rentBtnEl = document.getElementById('modalRentBtn');
    if (rentBtnEl) {
        rentBtnEl.innerHTML = '<i class="fas fa-right-from-bracket"></i> 대여하기';
        rentBtnEl.disabled = false;
        rentBtnEl.removeAttribute('style');
    }

    renderInventory();
    updateStats();
    initDashboard();
    showNotification('반납 처리가 완료되었습니다.', 'success');
    await renderNotes(currentSelectedId);
}

// ── 사용자 선택기 (탭 한 번으로 선택 — 모바일 우선) ──────────────────────────
// 개별 대여(#rentUserPicker)와 세트 대여(#setRentUserPicker)가 공용으로 사용한다.
// 선택값은 각 picker의 data-value-input이 가리키는 hidden input에 그대로 들어가므로
// 기존 대여 로직(document.getElementById('rentUser').value)은 변경 없이 동작한다.

const USER_PICKER_SEARCH_MIN = 8; // 사용자 수가 이 이상일 때만 검색창 노출

/**
 * 사용자 목록을 반환한다. Users 시트(usersData) 우선, 없으면 config의 USERS 폴백.
 * @returns {Array<{userName:string, department:string}>}
 */
function getUserOptions() {
    const source = (typeof usersData !== 'undefined' && usersData.length)
        ? usersData
        : (typeof USERS !== 'undefined' ? USERS : []);
    return source
        .map(u => (typeof u === 'string' ? { userName: u, department: '' } : u))
        .filter(u => u && u.userName);
}

/**
 * 선택기 하나를 현재 상태(선택값·검색어·열림여부)에 맞춰 렌더링한다.
 * @param {string} pickerId
 */
function renderUserPicker(pickerId) {
    const el = document.getElementById(pickerId);
    if (!el) return;

    const valueInput = document.getElementById(el.dataset.valueInput);
    const current    = valueInput ? valueInput.value.trim() : '';
    const users      = getUserOptions();
    const query      = el.dataset.query || '';
    const q          = query.toLowerCase();
    const list       = q ? users.filter(u => u.userName.toLowerCase().includes(q)) : users;
    const isOpen     = el.classList.contains('open');
    const showSearch = users.length >= USER_PICKER_SEARCH_MIN || !!query;
    const canManual  = !!query && !users.some(u => u.userName === query);

    el.innerHTML = `
        <button type="button" class="user-picker-btn${current ? ' filled' : ''}" data-act="toggle">
            <i class="fas fa-user"></i>
            <span class="user-picker-value">${current ? escapeHtml(current) : '사용자 선택'}</span>
            <i class="fas fa-chevron-down user-picker-caret"></i>
        </button>
        <div class="user-picker-panel"${isOpen ? '' : ' hidden'}>
            ${showSearch
                ? `<input type="text" class="user-picker-search" placeholder="이름 검색 · 직접 입력" value="${escapeHtml(query)}">`
                : ''}
            <div class="user-picker-list">
                ${list.length
                    ? list.map(u => `<button type="button" class="user-picker-opt${u.userName === current ? ' on' : ''}" data-user="${escapeHtml(u.userName)}">
                            <span>${escapeHtml(u.userName)}</span>${u.department ? `<em>${escapeHtml(u.department)}</em>` : ''}
                        </button>`).join('')
                    : `<div class="user-picker-empty">${users.length ? '검색 결과가 없습니다.' : '등록된 사용자가 없습니다. (Users 시트 확인)'}</div>`}
            </div>
            ${canManual
                ? `<button type="button" class="user-picker-manual" data-user="${escapeHtml(query)}">
                       <i class="fas fa-pen"></i> '${escapeHtml(query)}' (으)로 직접 입력
                   </button>`
                : ''}
        </div>`;

    el.onclick = e => {
        const opt = e.target.closest('[data-user]');
        if (opt) { pickUser(pickerId, opt.dataset.user); return; }
        if (e.target.closest('[data-act="toggle"]')) toggleUserPicker(pickerId);
    };

    const search = el.querySelector('.user-picker-search');
    if (search) {
        search.oninput = () => {
            el.dataset.query = search.value;
            renderUserPicker(pickerId);
            const next = el.querySelector('.user-picker-search');
            if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
        };
    }
}

/** 화면의 모든 사용자 선택기를 다시 그린다(Users 시트 로딩 완료 시 등). */
function refreshUserPickers() {
    document.querySelectorAll('.user-picker').forEach(el => renderUserPicker(el.id));
}

/** 열려 있는 선택기를 모두 닫는다. */
function closeAllUserPickers() {
    document.querySelectorAll('.user-picker.open').forEach(el => {
        el.classList.remove('open');
        el.dataset.query = '';
        renderUserPicker(el.id);
    });
}

function toggleUserPicker(pickerId) {
    const el = document.getElementById(pickerId);
    if (!el) return;
    const willOpen = !el.classList.contains('open');
    closeAllUserPickers();
    if (willOpen) el.classList.add('open');
    renderUserPicker(pickerId);
}

/** 닫혀 있을 때만 연다(필수 입력 검증 실패 시 안내용). */
function openUserPicker(pickerId) {
    const el = document.getElementById(pickerId);
    if (el && !el.classList.contains('open')) toggleUserPicker(pickerId);
}

/** 사용자 선택 확정 → hidden input 갱신 + 부서 자동완성. */
function pickUser(pickerId, userName) {
    setUserPickerValue(pickerId, userName);
    const el = document.getElementById(pickerId);
    if (el && el.dataset.deptSelect) onUserPicked(el.dataset.deptSelect, userName);
}

/** 선택값을 코드로 지정한다(모달 열기 프리필 · 다시 대여 등). */
function setUserPickerValue(pickerId, value) {
    const el = document.getElementById(pickerId);
    if (!el) return;
    const valueInput = document.getElementById(el.dataset.valueInput);
    if (valueInput) valueInput.value = (value || '').trim();
    el.classList.remove('open');
    el.dataset.query = '';
    renderUserPicker(pickerId);
}

/**
 * 사용자명 입력/선택 시 해당 사용자의 기본 부서를 부서 select에 자동 채운다.
 * @param {string} deptSelectId - 대상 부서 select id ('rentDepartment' | 'setRentDepartment')
 * @param {string} userName
 */
function onUserPicked(deptSelectId, userName) {
    if (typeof usersData === 'undefined' || !usersData.length) return;
    const u = usersData.find(x => x.userName === (userName || '').trim());
    if (!u || !u.department) return;
    const sel = document.getElementById(deptSelectId);
    if (!sel) return;
    const has = Array.from(sel.options).some(o => o.value === u.department);
    if (has) sel.value = u.department;
}

// ── 대여 다이얼로그 ───────────────────────────────────────────────────────────

/**
 * 가용 장비 대여 다이얼로그 열기
 */
function openRentModal() {
    if (!currentSelectedId) return;
    const item = inventoryData.find(i => i.id === currentSelectedId);
    if (!item) return;

    document.getElementById('rentModalSubtitle').innerText = item.name;

    setUserPickerValue('rentUserPicker',
        (item.user && item.user !== '-') ? item.user : (localStorage.getItem('lastRentUser') || ''));

    const sel = document.getElementById('rentDepartment');
    sel.innerHTML = '<option value="">-- 부서 선택 --</option>';
    DEPARTMENTS.forEach(dep => {
        const opt = document.createElement('option');
        opt.value = dep;
        opt.textContent = dep;
        if (item.department && item.department !== '-' && dep === item.department) opt.selected = true;
        sel.appendChild(opt);
    });

    const today = new Date();
    document.getElementById('rentDate').value =
        `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    document.getElementById('rentPurpose').value = (item.purpose && item.purpose !== '-') ? item.purpose : '';

    const confirmBtn = document.getElementById('rentConfirmBtn');
    confirmBtn.innerHTML = '<i class="fas fa-circle-check"></i> 대여 등록';
    confirmBtn.disabled  = false;

    document.getElementById('rentModal').classList.add('active');
}

function closeRentModal() {
    document.getElementById('rentModal').classList.remove('active');
}

/**
 * 대여 등록 확인 → updateItem API 호출 → History 자동 기록
 */
async function confirmRent() {
    if (!currentSelectedId) return;

    const userVal    = document.getElementById('rentUser').value.trim();
    const purposeVal = document.getElementById('rentPurpose').value.trim();
    const deptVal    = document.getElementById('rentDepartment').value;
    const dateVal    = document.getElementById('rentDate').value;

    if (!userVal) {
        showNotification('사용자를 선택해주세요.', 'error');
        openUserPicker('rentUserPicker');
        return;
    }

    let usageDate = '';
    if (dateVal) {
        const [y, m, d] = dateVal.split('-');
        usageDate = `${y}.${m}.${d}`;
    }

    const item       = inventoryData.find(i => i.id === currentSelectedId);
    if (!item) return;

    const confirmBtn    = document.getElementById('rentConfirmBtn');
    const originalHtml  = confirmBtn.innerHTML;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 처리 중...';
    confirmBtn.disabled  = true;

    try {
        const resp = await fetch(GOOGLE_WEBAPP_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'text/plain' },
            body:    JSON.stringify({
                action: 'updateItem',
                itemId: currentSelectedId,
                fields: {
                    status:     '대여중',
                    user:       userVal,
                    purpose:    purposeVal || item.purpose || '',
                    department: deptVal    || item.department || '',
                    usageDate:  usageDate
                }
            })
        });
        if (!resp.ok) throw new Error('서버 오류: ' + resp.status);
        const result = await resp.json();
        if (result?.error) throw new Error(result.error);
    } catch (e) {
        console.error('Rent failed:', e);
        showNotification('대여 처리 실패: ' + e.message, 'error');
        confirmBtn.innerHTML = originalHtml;
        confirmBtn.disabled  = false;
        return;
    }

    item.status     = '대여중';
    item.user       = userVal;
    item.purpose    = purposeVal || item.purpose;
    item.department = deptVal    || item.department;
    item.date       = usageDate  || item.date;

    localStorage.setItem('lastRentUser', userVal);

    const tag = document.getElementById('currentStatusTag');
    if (tag) { tag.className = `status-tag ${getStatusClass('대여중')}`; tag.innerText = '대여중'; }

    const rentBtnEl   = document.getElementById('modalRentBtn');
    const returnBtnEl = document.getElementById('modalReturnBtn');
    if (rentBtnEl)   rentBtnEl.style.display = 'none';
    if (returnBtnEl) {
        returnBtnEl.innerHTML = '<i class="fas fa-rotate-left"></i> 반납하기';
        returnBtnEl.disabled  = false;
        returnBtnEl.removeAttribute('style');
    }

    closeRentModal();
    renderInventory();
    updateStats();
    initDashboard();
    showNotification('대여 등록이 완료되었습니다.', 'success');
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
