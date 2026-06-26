// ═══ 시트 관리 모듈 ═══

/**
 * 시트 관리 섹션 진입 시 초기화
 */
function initSheetSection() {
    renderSheetTable();
    if (typeof renderSetMgmt === 'function') renderSetMgmt();
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
        if (typeof renderSetMgmt === 'function') renderSetMgmt();
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
    if (typeof renderSetMgmt === 'function') renderSetMgmt();
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

// ═══ 세트 관리 (CRUD) — 관리자 게이트 ═══

/**
 * 시트 관리 화면의 세트 목록을 렌더링한다.
 */
function renderSetMgmt() {
    const list = document.getElementById('setMgmtList');
    if (!list) return;

    const addBtn = document.getElementById('setMgmtAddBtn');
    if (addBtn) addBtn.style.display = sheetAdminUnlocked ? 'inline-flex' : 'none';

    if (typeof setsData === 'undefined' || !setsData.length) {
        list.innerHTML = '<div class="set-list-empty">정의된 세트가 없습니다.' +
            (sheetAdminUnlocked ? ' "새 세트"로 추가하세요.' : '') + '</div>';
        return;
    }

    list.innerHTML = setsData.map(s => {
        const comps = setItemsData.filter(it => it.setId === s.setId);
        const total = comps.reduce((a, c) => a + (c.quantity || 1), 0);
        return `<div class="set-mgmt-row">
            <div class="set-mgmt-info">
                <div class="set-mgmt-name"><i class="fas ${s.icon || 'fa-box'}" style="margin-right:7px;color:${s.color || 'var(--primary)'};"></i>${escapeHtml(s.setName)}</div>
                <div class="set-mgmt-meta">${s.team ? escapeHtml(s.team) + ' · ' : ''}${comps.length}종 · ${total}대</div>
            </div>
            ${sheetAdminUnlocked ? `<div class="set-mgmt-actions">
                <button class="set-mgmt-edit-btn" onclick="openSetFormModal('${s.setId}')"><i class="fas fa-pen"></i> 수정</button>
                <button class="set-mgmt-del-btn" onclick="deleteSetMgmt('${s.setId}')"><i class="fas fa-trash"></i></button>
            </div>` : ''}
        </div>`;
    }).join('');
}

/** 인벤토리 장비명 datalist를 채운다(세트 구성 입력 자동완성용). */
function populateInvNameList() {
    const dl = document.getElementById('invNameList');
    if (!dl) return;
    const names = Array.from(new Set(inventoryData.map(i => i.name).filter(n => n && n !== '-'))).sort();
    dl.innerHTML = names.map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
}

/** 세트 추가/수정 모달을 연다. */
function openSetFormModal(setId) {
    if (!sheetAdminUnlocked) return;
    setEditId = setId || null;
    document.getElementById('setFormTitle').innerText = setId ? '세트 수정' : '세트 추가';

    populateInvNameList();

    const set = setId ? setsData.find(s => s.setId === setId) : null;
    document.getElementById('sf_setName').value     = set ? set.setName : '';
    document.getElementById('sf_team').value        = set ? set.team : '';
    document.getElementById('sf_description').value = set ? set.description : '';
    document.getElementById('sf_icon').value        = set ? set.icon : '';
    document.getElementById('sf_color').value       = set ? set.color : '';

    const itemsWrap = document.getElementById('sf_items');
    itemsWrap.innerHTML = '';
    if (setId) {
        setItemsData.filter(it => it.setId === setId)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .forEach(it => addSetFormItemRow(it.itemName, it.quantity));
    }
    if (!itemsWrap.children.length) addSetFormItemRow();

    document.getElementById('setFormModal').classList.add('active');
}

function closeSetFormModal() {
    document.getElementById('setFormModal').classList.remove('active');
    setEditId = null;
}

/** 세트 구성 장비 입력 행을 추가한다. */
function addSetFormItemRow(name, qty) {
    const wrap = document.getElementById('sf_items');
    const row = document.createElement('div');
    row.className = 'set-form-item-row';
    row.innerHTML = `
        <input type="text" class="item-name local-input" list="invNameList" placeholder="장비명" value="${escapeHtml(name || '')}">
        <input type="number" class="qty local-input" min="1" value="${qty || 1}">
        <button type="button" class="set-form-item-del" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>`;
    wrap.appendChild(row);
}

/** 세트 추가/수정 저장 → saveSet/updateSet POST. */
async function saveSetForm() {
    if (!sheetAdminUnlocked) return;

    const setName = document.getElementById('sf_setName').value.trim();
    if (!setName) { showNotification('세트명을 입력하세요.', 'error'); return; }

    const items = Array.from(document.querySelectorAll('#sf_items .set-form-item-row')).map((row, idx) => ({
        itemName:  row.querySelector('.item-name').value.trim(),
        quantity:  Math.max(1, parseInt(row.querySelector('.qty').value, 10) || 1),
        sortOrder: idx + 1
    })).filter(it => it.itemName);

    if (!items.length) { showNotification('구성 장비를 1개 이상 추가하세요.', 'error'); return; }

    const set = {
        setName:     setName,
        team:        document.getElementById('sf_team').value.trim(),
        description: document.getElementById('sf_description').value.trim(),
        icon:        document.getElementById('sf_icon').value.trim(),
        color:       document.getElementById('sf_color').value.trim()
    };

    const btn = document.getElementById('setFormSaveBtn');
    btn.disabled  = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...';

    const payload = setEditId
        ? { action: 'updateSet', setId: setEditId, set, items }
        : { action: 'saveSet', set, items };

    try {
        const res    = await fetch(GOOGLE_WEBAPP_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'text/plain' },
            body:    JSON.stringify(payload)
        });
        const result = await res.json();
        if (!result || result.success === false || result.error) {
            throw new Error((result && result.error) || '알 수 없는 오류');
        }
        await loadSets();
        renderSetMgmt();
        closeSetFormModal();
        showNotification(setEditId ? '세트가 수정되었습니다.' : '세트가 추가되었습니다.', 'success');
    } catch (e) {
        showNotification('저장 실패: ' + e.message, 'error');
    } finally {
        btn.disabled  = false;
        btn.innerHTML = '<i class="fas fa-save"></i> 저장';
    }
}

/** 세트 삭제 → deleteSet POST. */
async function deleteSetMgmt(setId) {
    if (!sheetAdminUnlocked) return;
    const set = setsData.find(s => s.setId === setId);
    if (!confirm(`'${set ? set.setName : setId}' 세트를 삭제하시겠습니까? (대여 이력에는 영향 없음)`)) return;

    try {
        const res    = await fetch(GOOGLE_WEBAPP_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'text/plain' },
            body:    JSON.stringify({ action: 'deleteSet', setId: setId })
        });
        const result = await res.json();
        if (!result || result.success === false || result.error) {
            throw new Error((result && result.error) || '알 수 없는 오류');
        }
        await loadSets();
        renderSetMgmt();
        showNotification('세트가 삭제되었습니다.', 'success');
    } catch (e) {
        showNotification('삭제 실패: ' + e.message, 'error');
    }
}
