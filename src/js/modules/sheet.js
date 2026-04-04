// ═══ 시트 관리 모듈 ═══

/**
 * 시트 관리 섹션 진입 시 초기화
 */
function initSheetSection() {
    renderSheetTable();
}

/**
 * 스프레드시트 데이터를 HTML 테이블로 렌더링
 */
function renderSheetTable() {
    const cols  = ['장비명', '카테고리', '상태', '위치', '사용자', '사용 목적', '사용 부서', '날짜'];
    const thead = document.getElementById('sheetTableHead');
    const tbody = document.getElementById('sheetTableBody');

    thead.innerHTML = `<tr>
        ${cols.map(c => `<th>${c}</th>`).join('')}
        ${sheetAdminUnlocked ? '<th>수정</th><th>삭제</th>' : ''}
    </tr>`;

    tbody.innerHTML = inventoryData.map(item => `
        <tr>
            <td>${item.name}</td>
            <td>${item.category}</td>
            <td><span class="status-tag ${getStatusClass(item.status)}">${item.status}</span></td>
            <td>${item.location}</td>
            <td>${item.user}</td>
            <td>${item.purpose}</td>
            <td>${item.department}</td>
            <td>${item.date}</td>
            ${sheetAdminUnlocked ? `
            <td><button class="sheet-edit-btn" onclick="openSheetEditModal(${item.id})"><i class="fas fa-pen"></i> 수정</button></td>
            <td><button class="sheet-del-btn"  onclick="sheetDeleteItem(${item.id})"><i class="fas fa-trash"></i></button></td>
            ` : ''}
        </tr>
    `).join('');
}

/**
 * 관리자 잠금/해제 토글
 */
async function toggleSheetAdmin() {
    if (sheetAdminUnlocked) {
        sheetAdminUnlocked = false;
        document.getElementById('sheetAdminBtn').innerHTML = '<i class="fas fa-lock"></i> 관리자 잠금';
        document.getElementById('sheetAdminBtn').classList.remove('unlocked');
        renderSheetTable();
        return;
    }

    const pw = prompt('관리자 비밀번호를 입력하세요:');
    if (!pw) return;
    const hash = await hashPassword(pw);
    if (hash !== SHEET_ADMIN_HASH) {
        showNotification('비밀번호가 일치하지 않습니다.', 'error');
        return;
    }
    sheetAdminUnlocked = true;
    document.getElementById('sheetAdminBtn').innerHTML = '<i class="fas fa-lock-open"></i> 잠금 해제됨';
    document.getElementById('sheetAdminBtn').classList.add('unlocked');
    renderSheetTable();
}

/**
 * 장비 정보 수정 모달 열기
 * @param {number} itemId
 */
function openSheetEditModal(itemId) {
    const item = inventoryData.find(i => i.id === itemId);
    if (!item) return;
    sheetEditItemId = itemId;

    const categoryOptions = ['음향', '영상', '사진', '기타'];
    const statusOptions   = ['가용', '대여중', '수리중', '문제발견', '분실'];

    const fields = [
        { key: 'name',       label: '장비명',    type: 'text',   value: item.name       },
        { key: 'category',   label: '카테고리',  type: 'select', value: item.category,  options: categoryOptions },
        { key: 'status',     label: '상태',      type: 'select', value: item.status,    options: statusOptions   },
        { key: 'location',   label: '위치',      type: 'text',   value: item.location   },
        { key: 'user',       label: '사용자',    type: 'text',   value: item.user       },
        { key: 'purpose',    label: '사용 목적', type: 'text',   value: item.purpose    },
        { key: 'department', label: '사용 부서', type: 'text',   value: item.department },
    ];

    document.getElementById('sheetEditFields').innerHTML = fields.map(f => `
        <div class="edit-field">
            <label>${f.label}</label>
            ${f.type === 'select'
                ? `<select id="ef_${f.key}">${f.options.map(o => `<option value="${o}"${o === f.value ? ' selected' : ''}>${o}</option>`).join('')}</select>`
                : `<input type="text" id="ef_${f.key}" value="${(f.value || '').replace(/"/g, '&quot;')}">`
            }
        </div>
    `).join('');

    document.getElementById('sheetEditModal').classList.add('active');
}

/**
 * 장비 정보 수정 모달 닫기
 */
function closeSheetEditModal() {
    document.getElementById('sheetEditModal').classList.remove('active');
    sheetEditItemId = null;
}

/**
 * 장비 정보 수정 저장 (서버 반영 후 로컬 상태 갱신)
 */
async function saveSheetEdit() {
    if (!sheetEditItemId) return;

    const btn = document.getElementById('sheetSaveBtn');
    btn.disabled  = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...';

    const fields = {
        name:       document.getElementById('ef_name').value.trim(),
        category:   document.getElementById('ef_category').value,
        status:     document.getElementById('ef_status').value,
        location:   document.getElementById('ef_location').value.trim(),
        user:       document.getElementById('ef_user').value.trim(),
        purpose:    document.getElementById('ef_purpose').value.trim(),
        department: document.getElementById('ef_department').value.trim(),
    };

    try {
        const res    = await fetch(GOOGLE_WEBAPP_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'text/plain' },
            body:    JSON.stringify({ action: 'updateItem', itemId: sheetEditItemId, fields })
        });
        const result = await res.json();
        if (result.success) {
            const item = inventoryData.find(i => i.id === sheetEditItemId);
            if (item) Object.assign(item, fields, { icon: getIconByCategory(fields.category) });
            renderSheetTable();
            filterInventory();
            updateStats();
            initDashboard();
            closeSheetEditModal();
            showNotification('장비 정보가 수정되었습니다.', 'success');
        } else {
            showNotification('수정 실패: ' + (result.error || '알 수 없는 오류'), 'error');
        }
    } catch (e) {
        showNotification('오류: ' + e.message, 'error');
    } finally {
        btn.disabled  = false;
        btn.innerHTML = '<i class="fas fa-save"></i> 저장';
    }
}

/**
 * 시트 관리 화면에서 장비 삭제
 * @param {number} itemId
 */
async function sheetDeleteItem(itemId) {
    if (!sheetAdminUnlocked) return;
    if (!confirm('이 장비를 삭제하시겠습니까? 관련 메모와 사진도 모두 삭제됩니다.')) return;

    try {
        const res    = await fetch(GOOGLE_WEBAPP_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'text/plain' },
            body:    JSON.stringify({ action: 'deleteItem', itemId })
        });
        const result = await res.json();
        if (result.success) {
            inventoryData = inventoryData.filter(i => i.id !== itemId);
            delete pendingNotes[itemId];
            localStorage.removeItem('noteCount_' + itemId);
            renderSheetTable();
            filterInventory();
            updateStats();
            initDashboard();
            showNotification('장비가 삭제되었습니다.', 'success');
        } else {
            showNotification('삭제 실패: ' + (result.error || '알 수 없는 오류'), 'error');
        }
    } catch (e) {
        showNotification('오류: ' + e.message, 'error');
    }
}

/**
 * 장비 상세 모달에서 장비 삭제 (비밀번호 확인)
 */
async function deleteItem() {
    if (!currentSelectedId) return;

    const pw = prompt('장비를 삭제하려면 비밀번호를 입력하세요:');
    if (!pw) return;

    const hashed = await hashPassword(pw);
    if (hashed !== SHEET_ADMIN_HASH) {
        showNotification('비밀번호가 일치하지 않습니다.', 'error');
        return;
    }

    try {
        const resp = await fetch(GOOGLE_WEBAPP_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'text/plain' },
            body:    JSON.stringify({ action: 'deleteItem', itemId: currentSelectedId })
        });
        if (!resp.ok) throw new Error('서버 오류: ' + resp.status);
        const result = await resp.json();
        if (result?.error) throw new Error(result.error);
    } catch (e) {
        showNotification('삭제 실패: ' + e.message, 'error');
        return;
    }

    const deletedId = currentSelectedId;
    inventoryData   = inventoryData.filter(i => i.id !== deletedId);
    delete pendingNotes[deletedId];
    localStorage.removeItem(`noteCount_${deletedId}`);

    filterInventory();
    updateStats();
    initDashboard();
    if (document.getElementById('stats-section').style.display === 'block') initStats();
    closeModal();
    showNotification('장비가 삭제되었습니다.', 'success');
}

/**
 * 인쇄
 */
function printInventory() {
    window.print();
}
