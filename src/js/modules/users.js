// ═══ 사용자(대여자) 모듈 ═══
// Users 시트 로딩 + 대여자 선택기(탭 한 번으로 선택) + 전역 사용자 추가.
// 개별 대여(#rentUserPicker)와 세트 대여(#setRentUserPicker)가 공용으로 사용한다.
// 선택값은 각 picker의 data-value-input이 가리키는 hidden input에 그대로 들어가므로
// 기존 대여 로직(document.getElementById('rentUser').value)은 변경 없이 동작한다.

const USER_PICKER_SEARCH_MIN = 8;                        // 사용자 수가 이 이상일 때만 검색창 노출
const LOCAL_USERS_KEY        = 'soundreport.localUsers'; // 시트 반영 전 임시 보관

// ── Users 시트 로딩 ───────────────────────────────────────────────────────────

/**
 * Users를 로드해 usersData(state)를 채운다. 실패 시 config의 USERS 폴백 사용.
 * 시트에 아직 반영되지 않은 로컬 추가분은 뒤에 이어 붙인다.
 */
async function loadUsers() {
    let sheetUsers = [];
    try {
        const raw = await fetchGviz(USERS_SHEET_URL).then(gvizRowsToObjects);
        sheetUsers = raw.map(r => ({
            userName:   gvStr(r['UserName']),
            department: gvStr(r['Department']),
            role:       gvStr(r['Role']),
            isActive:   gvBool(r['IsActive'], true),
            sortOrder:  gvNum(r['SortOrder'], 0)
        })).filter(u => u.userName && u.isActive)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        pruneLocalUsers(sheetUsers); // 시트에 반영된 로컬 추가분은 캐시에서 제거
    } catch (e) {
        console.error('loadUsers 실패, 폴백 사용:', e);
        sheetUsers = (typeof USERS !== 'undefined' ? USERS : []).map(u =>
            typeof u === 'string' ? { userName: u, department: '' } : u);
    }
    usersData = mergeUserLists(sheetUsers, loadLocalUsers());
    refreshUserPickers();
}

// ── 로컬 추가 사용자 캐시 ─────────────────────────────────────────────────────
// GAS 저장이 실패해도(미배포·권한 등) 그 기기에서는 계속 고를 수 있도록 남긴다.

/** @returns {Array<{userName:string, department:string}>} */
function loadLocalUsers() {
    try {
        const raw = localStorage.getItem(LOCAL_USERS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.filter(u => u && u.userName) : [];
    } catch (e) {
        console.error('로컬 사용자 캐시 읽기 실패:', e);
        return [];
    }
}

function saveLocalUser(user) {
    const list = loadLocalUsers();
    if (list.some(u => u.userName === user.userName)) return;
    try {
        localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(list.concat([user])));
    } catch (e) {
        console.error('로컬 사용자 캐시 저장 실패:', e);
    }
}

/** 시트에 들어온 이름은 로컬 캐시에서 지운다(중복 관리 방지). */
function pruneLocalUsers(sheetUsers) {
    const names = sheetUsers.map(u => u.userName);
    const kept  = loadLocalUsers().filter(u => names.indexOf(u.userName) === -1);
    try {
        localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(kept));
    } catch (e) {
        console.error('로컬 사용자 캐시 정리 실패:', e);
    }
}

/** 이름 기준으로 앞선 목록을 우선해 합친다(불변 — 새 배열 반환). */
function mergeUserLists(primary, extra) {
    const seen = {};
    const out  = [];
    (primary || []).concat(extra || []).forEach(u => {
        const name = (u && u.userName) ? String(u.userName).trim() : '';
        if (!name || seen[name]) return;
        seen[name] = true;
        out.push(Object.assign({}, u, { userName: name }));
    });
    return out;
}

/**
 * 선택기에 표시할 사용자 목록. Users 시트(usersData) 우선, 없으면 config의 USERS 폴백.
 * 어느 경우든 로컬 추가분을 합쳐 방금 추가한 사람이 바로 보이게 한다.
 * @returns {Array<{userName:string, department:string}>}
 */
function getUserOptions() {
    const source = (typeof usersData !== 'undefined' && usersData.length)
        ? usersData
        : (typeof USERS !== 'undefined' ? USERS : []);
    const normalized = source
        .map(u => (typeof u === 'string' ? { userName: u, department: '' } : u))
        .filter(u => u && u.userName);
    return mergeUserLists(normalized, loadLocalUsers());
}

// ── 선택기 렌더링 ─────────────────────────────────────────────────────────────

/**
 * 선택기 하나를 현재 상태(선택값·검색어·열림여부·추가폼)에 맞춰 렌더링한다.
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
    const isAdding   = el.dataset.adding === '1';
    const showSearch = users.length >= USER_PICKER_SEARCH_MIN || !!query;
    const canManual  = !!query && !users.some(u => u.userName === query);

    const listHtml = list.length
        ? list.map(u => `<button type="button" class="user-picker-opt${u.userName === current ? ' on' : ''}" data-user="${escapeHtml(u.userName)}">
                <span>${escapeHtml(u.userName)}</span>${u.department ? `<em>${escapeHtml(u.department)}</em>` : ''}
            </button>`).join('')
        : `<div class="user-picker-empty">${users.length ? '검색 결과가 없습니다.' : '등록된 사용자가 없습니다. 아래에서 추가해주세요.'}</div>`;

    const browseHtml = `
        ${showSearch
            ? `<input type="text" class="user-picker-search" placeholder="이름 검색 · 직접 입력" value="${escapeHtml(query)}">`
            : ''}
        <div class="user-picker-list">${listHtml}</div>
        ${canManual
            ? `<button type="button" class="user-picker-manual" data-user="${escapeHtml(query)}">
                   <i class="fas fa-pen"></i> '${escapeHtml(query)}' (으)로 이번만 입력
               </button>`
            : ''}
        <button type="button" class="user-picker-add" data-act="add">
            <i class="fas fa-user-plus"></i> ${query ? `'${escapeHtml(query)}' 추가하기` : '추가하기'}
        </button>`;

    el.innerHTML = `
        <button type="button" class="user-picker-btn${current ? ' filled' : ''}" data-act="toggle">
            <i class="fas fa-user"></i>
            <span class="user-picker-value">${current ? escapeHtml(current) : '사용자 선택'}</span>
            <i class="fas fa-chevron-down user-picker-caret"></i>
        </button>
        <div class="user-picker-panel"${isOpen ? '' : ' hidden'}>
            ${isAdding ? renderUserAddForm(el.dataset.addName || query) : browseHtml}
        </div>`;

    // 선택기 내부 클릭은 여기서 소비한다. innerHTML을 다시 그리는 순간 e.target이
    // DOM에서 떨어져 나가 document 레벨의 "바깥 클릭" 판정(closest → null)이 항상
    // 참이 되고, 방금 연 패널이 그대로 닫혀버려 선택 자체가 불가능해지기 때문이다.
    el.onclick = e => {
        e.stopPropagation();
        const opt = e.target.closest('[data-user]');
        if (opt) { pickUser(pickerId, opt.dataset.user); return; }

        const actEl = e.target.closest('[data-act]');
        const act   = actEl ? actEl.dataset.act : '';
        if      (act === 'toggle')     toggleUserPicker(pickerId);
        else if (act === 'add')        openUserAddForm(pickerId);
        else if (act === 'add-cancel') closeUserAddForm(pickerId);
        else if (act === 'add-save')   submitUserAddForm(pickerId);
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

    const nameInput = el.querySelector('.upa-name');
    if (nameInput) {
        // 입력값을 dataset에 남겨야 다시 그려도 입력하던 이름이 살아남는다.
        nameInput.oninput   = () => { el.dataset.addName = nameInput.value; };
        nameInput.onkeydown = ev => {
            ev.stopPropagation();
            if (ev.key === 'Enter') { ev.preventDefault(); submitUserAddForm(pickerId); }
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
        el.dataset.query   = '';
        el.dataset.adding  = '';
        el.dataset.addName = '';
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
    el.dataset.query   = '';
    el.dataset.adding  = '';
    el.dataset.addName = '';
    renderUserPicker(pickerId);
}

/**
 * 사용자명 선택 시 해당 사용자의 기본 부서를 부서 select에 자동 채운다.
 * @param {string} deptSelectId - 대상 부서 select id ('rentDepartment' | 'setRentDepartment')
 * @param {string} userName
 */
function onUserPicked(deptSelectId, userName) {
    const user = getUserOptions().find(x => x.userName === (userName || '').trim());
    if (!user || !user.department) return;
    const sel = document.getElementById(deptSelectId);
    if (!sel) return;
    const has = Array.from(sel.options).some(o => o.value === user.department);
    if (has) sel.value = user.department;
}

// ── 사용자 추가 (전역 반영) ───────────────────────────────────────────────────

/** 선택기 패널 안에 들어가는 추가 폼 HTML. */
function renderUserAddForm(name) {
    const departments = (typeof DEPARTMENTS !== 'undefined' ? DEPARTMENTS : []);
    return `
        <div class="user-picker-add-form">
            <div class="upa-title"><i class="fas fa-user-plus"></i> 사용자 추가</div>
            <input type="text" class="upa-name" placeholder="이름" value="${escapeHtml(name || '')}">
            <select class="upa-dept">
                <option value="">-- 부서 선택 (선택사항) --</option>
                ${departments.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('')}
            </select>
            <div class="upa-actions">
                <button type="button" class="upa-cancel" data-act="add-cancel">취소</button>
                <button type="button" class="upa-save" data-act="add-save"><i class="fas fa-check"></i> 추가</button>
            </div>
            <div class="upa-hint">추가한 사용자는 Users 시트에 저장되어 모든 대여 화면에 나타납니다.</div>
        </div>`;
}

function openUserAddForm(pickerId) {
    const el = document.getElementById(pickerId);
    if (!el) return;
    el.classList.add('open');
    el.dataset.adding  = '1';
    el.dataset.addName = el.dataset.query || '';
    renderUserPicker(pickerId);
    const input = el.querySelector('.upa-name');
    if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
}

function closeUserAddForm(pickerId) {
    const el = document.getElementById(pickerId);
    if (!el) return;
    el.dataset.adding  = '';
    el.dataset.addName = '';
    renderUserPicker(pickerId);
}

/**
 * 추가 폼 제출 → 로컬 즉시 반영(낙관적) 후 Users 시트에 저장 요청.
 * 시트 저장이 실패해도 그 기기에서는 계속 선택할 수 있도록 남긴다.
 */
async function submitUserAddForm(pickerId) {
    const el = document.getElementById(pickerId);
    if (!el) return;

    const nameInput = el.querySelector('.upa-name');
    const deptInput = el.querySelector('.upa-dept');
    const name = ((nameInput ? nameInput.value : el.dataset.addName) || '').trim();
    const dept = deptInput ? deptInput.value : '';

    if (!name) {
        showNotification('이름을 입력해주세요.', 'error');
        if (nameInput) nameInput.focus();
        return;
    }
    if (getUserOptions().some(u => u.userName === name)) {
        showNotification(`'${name}'은(는) 이미 등록된 사용자입니다.`, 'error');
        pickUser(pickerId, name);
        return;
    }

    const user = { userName: name, department: dept, role: '', isActive: true, sortOrder: nextUserSortOrder() };

    usersData = mergeUserLists(usersData, [user]); // 낙관적 반영 (불변 갱신)
    saveLocalUser(user);
    pickUser(pickerId, name);
    refreshUserPickers();
    showNotification(`'${name}' 사용자를 추가했습니다.`, 'success');

    try {
        const resp = await fetch(GOOGLE_WEBAPP_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'text/plain' },
            body:    JSON.stringify({ action: 'addUser', user: user })
        });
        if (!resp.ok) throw new Error('서버 오류: ' + resp.status);
        const result = await resp.json();
        if (!result || result.success === false || result.error) {
            throw new Error((result && result.error) || '저장 실패');
        }
    } catch (e) {
        // 로컬에는 남아 있어 대여는 계속 가능하다 — 다른 기기에 안 보일 뿐이다.
        console.error('addUser 실패:', e);
        showNotification(`'${name}'은(는) 이 기기에만 저장되었습니다. 시트 반영 실패: ${e.message}`, 'error');
    }
}

/** 새 사용자의 정렬 순서 — 기존 최대값 뒤에 오도록. */
function nextUserSortOrder() {
    const orders = getUserOptions().map(u => Number(u.sortOrder) || 0);
    return (orders.length ? Math.max.apply(null, orders) : 0) + 10;
}
