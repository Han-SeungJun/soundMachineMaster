// ═══ 세트 관리 모듈 (CRUD) — 관리자 게이트 ═══
// 시트 관리와 분리된 독립 메뉴다. 세트의 생성·수정·삭제는 모두 이 화면의
// 관리자 모드 안에서만 노출되며, 잠금 상태는 시트 관리와 별도로 관리한다.

/**
 * 세트 관리 섹션 진입 시 초기화
 */
function initSetMgmtSection() {
    syncSetAdminBtn();
    renderSetMgmt();
}

/**
 * 관리자 버튼의 라벨/스타일을 현재 잠금 상태에 맞춘다.
 */
function syncSetAdminBtn() {
    const btn = document.getElementById('setAdminBtn');
    if (!btn) return;
    btn.innerHTML = setAdminUnlocked
        ? '<i class="fas fa-lock-open"></i> 잠금 해제됨'
        : '<i class="fas fa-lock"></i> 관리자 잠금';
    btn.classList.toggle('unlocked', setAdminUnlocked);
}

/**
 * 세트 관리 관리자 모드 진입/해제 토글
 */
async function toggleSetAdmin() {
    if (setAdminUnlocked) {
        setAdminUnlocked = false;
    } else {
        if (!await promptAdminHash('세트를 관리하려면 관리자 비밀번호를 입력하세요:')) return;
        setAdminUnlocked = true;
    }
    syncSetAdminBtn();
    renderSetMgmt();
}

/**
 * 세트 목록을 렌더링한다. 추가·수정·삭제 버튼은 관리자 모드에서만 노출한다.
 */
function renderSetMgmt() {
    const list = document.getElementById('setMgmtList');
    if (!list) return;

    const addBtn = document.getElementById('setMgmtAddBtn');
    if (addBtn) addBtn.style.display = setAdminUnlocked ? 'inline-flex' : 'none';

    const hint = document.getElementById('setMgmtLockHint');
    if (hint) hint.hidden = setAdminUnlocked;

    if (typeof setsData === 'undefined' || !setsData.length) {
        list.innerHTML = '<div class="set-list-empty">정의된 세트가 없습니다.' +
            (setAdminUnlocked ? ' "새 세트"로 추가하세요.' : '') + '</div>';
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
            <div class="set-mgmt-actions">
                ${setAdminUnlocked ? `
                <button class="set-mgmt-edit-btn" onclick="openSetFormModal('${escapeAttrArg(s.setId)}')"><i class="fas fa-pen"></i> 수정</button>
                <button class="set-mgmt-del-btn" onclick="deleteSetMgmt('${escapeAttrArg(s.setId)}')"
                        title="세트 삭제 — 관리자 비밀번호 필요"><i class="fas fa-trash"></i> 삭제</button>
                ` : ''}
            </div>
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
    if (!setAdminUnlocked) return;
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
    if (!setAdminUnlocked) return;

    const setName = document.getElementById('sf_setName').value.trim();
    if (!setName) { showNotification('세트명을 입력하세요.', 'error'); return; }

    const items = Array.from(document.querySelectorAll('#sf_items .set-form-item-row')).map((row, idx) => ({
        itemName:  row.querySelector('.item-name').value.trim(),
        quantity:  Math.max(1, parseInt(row.querySelector('.qty').value, 10) || 1),
        sortOrder: idx + 1
    })).filter(it => it.itemName);

    if (!items.length) { showNotification('구성 장비를 1개 이상 추가하세요.', 'error'); return; }

    // 재고에 없는 장비명은 대여 시 조용히 매칭 실패로 이어지므로 저장 전에 확인시킨다.
    const known   = new Set(inventoryData.map(i => i.name));
    const unknown = items.map(it => it.itemName).filter(n => !known.has(n));
    const GAP     = String.fromCharCode(10, 10);
    if (unknown.length &&
        !confirm('재고에 없는 장비명이 있습니다:' + GAP + unknown.join(', ') + GAP +
                 '이대로 저장하면 대여 시 "미등록"으로 표시되고 매칭되지 않습니다. 계속할까요?')) {
        return;
    }

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

/** 세트 삭제 요청이 진행 중인지 — 같은 세트를 두 번 지우지 않도록 막는다. */
let setDeleteInFlight = false;

/**
 * 세트 삭제 → 관리자 비밀번호 확인 후 deleteSet POST.
 * 관리자 모드로 들어와 있어도 매번 비밀번호를 다시 받는다(되돌릴 수 없는 작업).
 * @param {string} setId
 */
async function deleteSetMgmt(setId) {
    if (!setAdminUnlocked) return;
    if (setDeleteInFlight) return;

    const set   = setsData.find(s => s.setId === setId);
    const label = set ? set.setName : setId;
    const comps = (typeof setItemsData !== 'undefined' ? setItemsData : [])
        .filter(it => it.setId === setId);

    const NL = String.fromCharCode(10);
    if (!confirm(`'${label}' 세트를 삭제하시겠습니까?` + NL +
                 `구성 장비 ${comps.length}종도 함께 삭제됩니다. (대여 이력에는 영향 없음)`)) return;

    const adminHash = await promptAdminHash(`'${label}' 세트를 삭제하려면 관리자 비밀번호를 입력하세요:`);
    if (!adminHash) return;

    setDeleteInFlight = true;
    try {
        const res    = await fetch(GOOGLE_WEBAPP_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'text/plain' },
            body:    JSON.stringify({ action: 'deleteSet', setId: setId, adminHash: adminHash })
        });
        const result = await res.json();
        if (!result || result.success === false || result.error) {
            throw new Error((result && result.error) || '알 수 없는 오류');
        }
        await refreshAfterSetDelete(setId);
        showNotification(`'${label}' 세트가 삭제되었습니다.`, 'success');
    } catch (e) {
        showNotification('삭제 실패: ' + e.message, 'error');
    } finally {
        setDeleteInFlight = false;
    }
}

/**
 * 세트 삭제 후 화면 정리 — 목록 재로딩과, 열려 있는 세트 대여 모달 갱신.
 * 삭제된 세트가 선택 중이었다면 선택을 비워 대여 버튼이 남지 않도록 한다.
 * @param {string} setId
 */
async function refreshAfterSetDelete(setId) {
    if (typeof currentSetSelection !== 'undefined' &&
        currentSetSelection && currentSetSelection.setId === setId && !currentSetSelection.custom) {
        currentSetSelection = null;
    }

    await loadSets();          // setsData/setItemsData 재로딩 + 대시보드 리렌더
    renderSetMgmt();

    const modal = document.getElementById('setRentModal');
    if (!modal || !modal.classList.contains('active')) return;

    renderSetList();
    renderSetComponents();
    const btn = document.getElementById('setRentConfirmBtn');
    if (btn) btn.disabled = !currentSetSelection || !currentSetSelection.matchedIds.length;
}
