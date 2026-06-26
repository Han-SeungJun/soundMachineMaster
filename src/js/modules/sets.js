// ═══ 세트 대여 모듈 ═══
// gviz로 Sets/SetItems/Users/RentBundles를 읽고, 세트 선택 시 가용 유닛을 매칭해
// GAS rentSet 액션으로 일괄 대여한다. 개별 대여(modal.js) 흐름은 건드리지 않는다.

// ── gviz 값 보정 헬퍼 ─────────────────────────────────────────────────────────

function gvStr(v)  { return (v == null) ? '' : String(v).trim(); }
function gvNum(v, d) { const n = Number(v); return isNaN(n) ? (d || 0) : n; }
function gvBool(v, d) {
    if (v === true)  return true;
    if (v === false) return false;
    const s = String(v == null ? '' : v).trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'y' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'n' || s === 'no')  return false;
    return (d !== undefined) ? d : false;
}

/**
 * gviz 날짜 셀("Date(Y,M,D,h,m,s)" 또는 일반 문자열)을 정렬용 timestamp로 변환.
 * gviz의 월(M)은 0-based이며 JS Date도 0-based이므로 그대로 사용한다.
 */
function parseGvizDate(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return v;
    const s = String(v);
    const m = s.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)/);
    if (m) {
        return new Date(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
    }
    const t = Date.parse(s);
    return isNaN(t) ? 0 : t;
}

// ── 데이터 로딩 ───────────────────────────────────────────────────────────────

/**
 * Sets + SetItems를 로드해 setsData / setItemsData(state)를 채운다.
 */
async function loadSets() {
    try {
        const [setsRaw, itemsRaw] = await Promise.all([
            fetchGviz(SETS_SHEET_URL).then(gvizRowsToObjects),
            fetchGviz(SETITEMS_SHEET_URL).then(gvizRowsToObjects)
        ]);

        setsData = setsRaw.map(r => ({
            setId:       gvStr(r['SetID']),
            setName:     gvStr(r['SetName']),
            team:        gvStr(r['Team']),
            description: gvStr(r['Description']),
            icon:        gvStr(r['Icon']),
            color:       gvStr(r['Color']),
            isActive:    gvBool(r['IsActive'], true),
            sortOrder:   gvNum(r['SortOrder'], 0),
            createdBy:   gvStr(r['CreatedBy'])
        })).filter(s => s.setId && s.isActive)
          .sort((a, b) => a.sortOrder - b.sortOrder);

        setItemsData = itemsRaw.map(r => ({
            setId:     gvStr(r['SetID']),
            itemName:  gvStr(r['ItemName']),
            category:  gvStr(r['Category']),
            quantity:  gvNum(r['Quantity'], 1),
            sortOrder: gvNum(r['SortOrder'], 0),
            note:      gvStr(r['Note'])
        })).filter(it => it.setId && it.itemName);
    } catch (e) {
        console.error('loadSets 실패:', e);
        setsData = [];
        setItemsData = [];
    }
}

/**
 * Users를 로드해 usersData(state)를 채운다. 실패 시 config의 USERS 폴백 사용.
 */
async function loadUsers() {
    try {
        const raw = await fetchGviz(USERS_SHEET_URL).then(gvizRowsToObjects);
        usersData = raw.map(r => ({
            userName:   gvStr(r['UserName']),
            department: gvStr(r['Department']),
            role:       gvStr(r['Role']),
            isActive:   gvBool(r['IsActive'], true),
            sortOrder:  gvNum(r['SortOrder'], 0)
        })).filter(u => u.userName && u.isActive)
          .sort((a, b) => a.sortOrder - b.sortOrder);
    } catch (e) {
        console.error('loadUsers 실패, 폴백 사용:', e);
        usersData = (typeof USERS !== 'undefined' ? USERS : []).map(u =>
            typeof u === 'string' ? { userName: u, department: '' } : u);
    }
    if (typeof populateUserDatalist === 'function') populateUserDatalist();
}

/**
 * RentBundles를 로드해 rentBundlesData(state)를 채운다.
 */
async function loadRentBundles() {
    try {
        const raw = await fetchGviz(RENTBUNDLES_SHEET_URL).then(gvizRowsToObjects);
        rentBundlesData = raw.map(r => ({
            bundleId:   gvStr(r['BundleID']),
            userName:   gvStr(r['UserName']),
            setId:      gvStr(r['SetID']),
            setName:    gvStr(r['SetName']),
            team:       gvStr(r['Team']),
            itemNames:  gvStr(r['ItemNames']),
            purpose:    gvStr(r['Purpose']),
            department: gvStr(r['Department']),
            usageDate:  gvStr(r['UsageDate']),
            isFavorite: gvBool(r['IsFavorite'], false),
            useCount:   gvNum(r['UseCount'], 1),
            lastUsedAt: parseGvizDate(r['LastUsedAt']),
            createdAt:  parseGvizDate(r['CreatedAt'])
        })).filter(b => b.bundleId);
    } catch (e) {
        console.error('loadRentBundles 실패:', e);
        rentBundlesData = [];
    }
    renderQuickSets();
}

// ── 이름 → 가용 유닛 매칭 (§5) ────────────────────────────────────────────────

/**
 * 세트 구성 장비를 inventoryData의 '가용' 유닛과 매칭한다.
 * @param {string} setId
 * @returns {{setId, setName, team, matchedIds:Array, shortages:Array, detail:Array, components:Array}}
 */
function resolveSetUnits(setId) {
    const set   = setsData.find(s => s.setId === setId);
    const comps = setItemsData.filter(it => it.setId === setId)
                              .sort((a, b) => a.sortOrder - b.sortOrder);

    const usedIds    = new Set();
    const matchedIds = [];
    const shortages  = [];
    const detail     = [];

    comps.forEach(c => {
        const need  = c.quantity || 1;
        const avail = inventoryData.filter(inv =>
            inv.name === c.itemName &&
            (!c.category || inv.category === c.category) &&
            (inv.status || '').trim() === '가용' &&
            !usedIds.has(inv.id)
        );
        const take = avail.slice(0, need);
        take.forEach(u => { usedIds.add(u.id); matchedIds.push(u.id); });
        if (take.length < need) shortages.push({ itemName: c.itemName, need, have: take.length });
        detail.push({ itemName: c.itemName, category: c.category, need, have: take.length, ids: take.map(u => u.id) });
    });

    return {
        setId,
        setName: set ? set.setName : '',
        team:    set ? set.team : '',
        matchedIds, shortages, detail, components: comps
    };
}

/**
 * 정의된 세트가 아닌 즉석 묶음(이름 목록)을 가용 유닛과 매칭한다(다시 대여용).
 */
function resolveAdhocUnits(names, bundle) {
    const counts = {};
    names.forEach(n => { counts[n] = (counts[n] || 0) + 1; });

    const usedIds    = new Set();
    const matchedIds = [];
    const shortages  = [];
    const detail     = [];

    Object.keys(counts).forEach(name => {
        const need  = counts[name];
        const avail = inventoryData.filter(inv =>
            inv.name === name && (inv.status || '').trim() === '가용' && !usedIds.has(inv.id));
        const take = avail.slice(0, need);
        take.forEach(u => { usedIds.add(u.id); matchedIds.push(u.id); });
        if (take.length < need) shortages.push({ itemName: name, need, have: take.length });
        detail.push({ itemName: name, category: '', need, have: take.length, ids: take.map(u => u.id) });
    });

    return {
        setId:   bundle ? bundle.setId : '',
        setName: bundle ? bundle.setName : '',
        team:    bundle ? bundle.team : '',
        matchedIds, shortages, detail,
        components: detail.map(d => ({ quantity: d.need })),
        adhoc: true
    };
}

// ── 세트 대여 모달 ─────────────────────────────────────────────────────────────

function openSetRentModal() {
    currentSetSelection = null;

    const today = new Date();
    document.getElementById('setRentDate').value =
        `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    document.getElementById('setRentUser').value    = localStorage.getItem('lastRentUser') || '';
    document.getElementById('setRentPurpose').value = '';
    const searchEl = document.getElementById('setSearchInput');
    if (searchEl) searchEl.value = '';

    if (typeof populateUserDatalist === 'function') populateUserDatalist();
    populateSetDeptSelect();

    renderQuickSets();
    renderSetList();
    document.getElementById('setCompList').innerHTML =
        '<div class="set-comp-empty">세트를 선택하면 구성 장비가 표시됩니다.</div>';
    document.getElementById('setRentConfirmBtn').disabled = true;

    document.getElementById('setRentModal').classList.add('active');
}

function closeSetRentModal() {
    document.getElementById('setRentModal').classList.remove('active');
    currentSetSelection = null;
}

function populateSetDeptSelect() {
    const sel = document.getElementById('setRentDepartment');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- 부서 선택 --</option>' +
        DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('');
}

function filterSetList() {
    renderSetList();
}

/**
 * 검색어/팀 그룹별로 세트 목록을 렌더링한다.
 */
function renderSetList() {
    const list = document.getElementById('setListArea');
    if (!list) return;

    if (!setsData.length) {
        list.innerHTML = '<div class="set-list-empty">정의된 세트가 없습니다. (Sets 시트 확인)</div>';
        return;
    }

    const q = (document.getElementById('setSearchInput')?.value || '').toLowerCase().trim();
    const filtered = setsData.filter(s =>
        !q || s.setName.toLowerCase().includes(q) || (s.team || '').toLowerCase().includes(q));

    if (!filtered.length) {
        list.innerHTML = '<div class="set-list-empty">검색 결과가 없습니다.</div>';
        return;
    }

    const groups = {};
    filtered.forEach(s => { const t = s.team || '공용'; (groups[t] = groups[t] || []).push(s); });

    list.innerHTML = Object.keys(groups).map(team => `
        <div class="set-group">
            <div class="set-group-title">${escapeHtml(team)}</div>
            ${groups[team].map(s => {
                const res   = resolveSetUnits(s.setId);
                const total = res.components.reduce((a, c) => a + (c.quantity || 1), 0);
                const have  = res.matchedIds.length;
                const short = res.shortages.length > 0;
                const on    = currentSetSelection && currentSetSelection.setId === s.setId && !currentSetSelection.adhoc;
                const iconStyle = s.color ? `background:${s.color}1a;color:${s.color};` : '';
                return `<button class="set-card-btn ${on ? 'on' : ''}" onclick="selectSet('${s.setId}')">
                    <span class="set-card-icon" style="${iconStyle}"><i class="fas ${s.icon || 'fa-box'}"></i></span>
                    <span class="set-card-body">
                        <span class="set-card-name">${escapeHtml(s.setName)}</span>
                        <span class="set-card-meta">${res.components.length}종 · ${total}대
                            <span class="set-avail ${short ? 'short' : 'ok'}">가용 ${have}/${total}</span>
                        </span>
                    </span>
                </button>`;
            }).join('')}
        </div>`).join('');
}

function selectSet(setId) {
    currentSetSelection = resolveSetUnits(setId);
    renderSetList();
    renderSetComponents();
    document.getElementById('setRentConfirmBtn').disabled = currentSetSelection.matchedIds.length === 0;
}

/**
 * 선택된 세트의 구성 장비별 가용/부족 배지를 렌더링한다.
 */
function renderSetComponents() {
    const area = document.getElementById('setCompList');
    const sel  = currentSetSelection;
    if (!area) return;
    if (!sel) { area.innerHTML = ''; return; }

    const title = sel.setName || '선택한 묶음';
    area.innerHTML = `
        <div class="set-comp-head">${escapeHtml(title)} 구성 장비</div>
        ${sel.detail.map(d => {
            const ok = d.have >= d.need;
            return `<div class="set-comp-row ${ok ? '' : 'short'}">
                <span class="set-comp-name">${escapeHtml(d.itemName)}${d.category ? ` <em>${escapeHtml(d.category)}</em>` : ''}</span>
                <span class="set-comp-badge ${ok ? 'ok' : 'short'}">${ok ? '가용' : '부족'} ${d.have}/${d.need}</span>
            </div>`;
        }).join('')}
        ${sel.shortages.length ? `<div class="set-comp-warn">
            <i class="fas fa-triangle-exclamation"></i>
            부족 ${sel.shortages.length}종 — 가용분(${sel.matchedIds.length}대)만 대여됩니다.
        </div>` : ''}`;
}

/**
 * 세트 대여 확정 → GAS rentSet 단일 호출 → 로컬 갱신/리렌더.
 */
async function confirmSetRent() {
    const sel = currentSetSelection;
    if (!sel || !sel.matchedIds.length) {
        showNotification('대여 가능한 장비가 없습니다.', 'error');
        return;
    }

    const userVal    = document.getElementById('setRentUser').value.trim();
    const purposeVal = document.getElementById('setRentPurpose').value.trim();
    const deptVal    = document.getElementById('setRentDepartment').value;
    const dateVal    = document.getElementById('setRentDate').value;

    if (!userVal) {
        showNotification('사용자를 입력해주세요.', 'error');
        document.getElementById('setRentUser').focus();
        return;
    }

    let usageDate = '';
    if (dateVal) { const [y, m, d] = dateVal.split('-'); usageDate = `${y}.${m}.${d}`; }

    if (sel.shortages.length) {
        if (!confirm(`부족 ${sel.shortages.length}종이 있습니다. 가용분 ${sel.matchedIds.length}대만 대여할까요?`)) return;
    }

    const itemNames = sel.detail.reduce((acc, d) => acc.concat(d.ids.map(() => d.itemName)), []).join('|');

    const btn  = document.getElementById('setRentConfirmBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 처리 중...';
    btn.disabled  = true;

    let result;
    try {
        const resp = await fetch(GOOGLE_WEBAPP_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'text/plain' },
            body:    JSON.stringify({
                action: 'rentSet',
                items:  sel.matchedIds.map(id => ({ itemId: id })),
                common: { user: userVal, purpose: purposeVal, department: deptVal, usageDate: usageDate },
                bundle: { setId: sel.setId || '', setName: sel.setName || '', team: sel.team || '', itemNames: itemNames }
            })
        });
        if (!resp.ok) throw new Error('서버 오류: ' + resp.status);
        result = await resp.json();
        if (result && result.error) throw new Error(result.error);
    } catch (e) {
        console.error('rentSet failed:', e);
        showNotification('세트 대여 실패: ' + e.message, 'error');
        btn.innerHTML = orig;
        btn.disabled  = false;
        return;
    }

    const succeeded = (result && result.succeeded) ? result.succeeded.map(String) : sel.matchedIds.map(String);
    const failedN   = (result && result.failed) ? result.failed.length : 0;

    succeeded.forEach(idStr => {
        const item = inventoryData.find(i => String(i.id) === idStr);
        if (item) {
            item.status     = '대여중';
            item.user       = userVal;
            if (purposeVal) item.purpose    = purposeVal;
            if (deptVal)    item.department = deptVal;
            if (usageDate)  item.date       = usageDate;
        }
    });

    localStorage.setItem('lastRentUser', userVal);

    renderInventory();
    updateStats();
    initDashboard();
    closeSetRentModal();
    showNotification(
        `세트 대여 완료: 성공 ${succeeded.length}건${failedN ? ` · 실패 ${failedN}건` : ''}`,
        failedN ? 'error' : 'success'
    );

    loadRentBundles(); // 묶음/quick-sets 캐시 새로고침 (백그라운드)
}

// ── 최근 / 즐겨찾기 / 마지막 세트 (요구사항 4) ─────────────────────────────────

function getCurrentRentUser() {
    return (localStorage.getItem('lastRentUser') || '').trim();
}

/** itemNames 정렬본 기준으로 중복 묶음을 제거하고 최신순으로 반환. */
function dedupeBundles(bundles) {
    const seen = {};
    const out  = [];
    bundles.slice().sort((a, b) => b.lastUsedAt - a.lastUsedAt).forEach(b => {
        const key = (b.itemNames || '').split('|').map(s => s.trim()).filter(Boolean).sort().join('|');
        if (!key || seen[key]) return;
        seen[key] = true;
        out.push(b);
    });
    return out;
}

function renderQuickSets() {
    const area = document.getElementById('quickSetsArea');
    if (!area) return;

    const user = getCurrentRentUser();
    let bundles = rentBundlesData.slice();
    if (user) bundles = bundles.filter(b => b.userName === user);

    const deduped   = dedupeBundles(bundles);
    const favorites = deduped.filter(b => b.isFavorite);
    const recents   = deduped.slice(0, 5);

    if (!deduped.length) {
        area.innerHTML = user
            ? `<div class="quick-empty">${escapeHtml(user)}님의 최근 대여 묶음이 없습니다.</div>`
            : `<div class="quick-empty">대여 이력이 쌓이면 최근·즐겨찾기 세트가 표시됩니다.</div>`;
        return;
    }

    const chip = (b) => {
        const cnt   = (b.itemNames || '').split('|').filter(Boolean).length;
        const label = b.setName || `${cnt}종 묶음`;
        return `<div class="quick-chip">
            <button class="quick-chip-main" onclick="reRentBundle('${b.bundleId}')" title="이 묶음으로 다시 대여">
                <i class="fas fa-rotate-left"></i> ${escapeHtml(label)} <em>${cnt}대</em>
            </button>
            <button class="quick-chip-fav ${b.isFavorite ? 'on' : ''}" onclick="toggleSetFavorite('${b.bundleId}', event)" title="즐겨찾기">
                <i class="fas fa-star"></i>
            </button>
        </div>`;
    };

    let html = '';
    if (favorites.length) {
        html += `<div class="quick-row-label"><i class="fas fa-star"></i> 즐겨찾기</div>`;
        html += `<div class="quick-row">${favorites.map(chip).join('')}</div>`;
    }
    html += `<div class="quick-row-label"><i class="fas fa-clock-rotate-left"></i> 최근</div>`;
    html += `<div class="quick-row">${recents.map(chip).join('')}</div>`;
    area.innerHTML = html;
}

/** 묶음 하나로 공통 입력을 프리필하고 즉석 매칭(다시 대여). */
function reRentBundle(bundleId) {
    const b = rentBundlesData.find(x => x.bundleId === bundleId);
    if (!b) return;

    if (b.userName) document.getElementById('setRentUser').value = b.userName;
    if (b.purpose)  document.getElementById('setRentPurpose').value = b.purpose;
    populateSetDeptSelect();
    if (b.department) document.getElementById('setRentDepartment').value = b.department;

    const names = (b.itemNames || '').split('|').map(s => s.trim()).filter(Boolean);
    currentSetSelection = resolveAdhocUnits(names, b);
    renderSetList();
    renderSetComponents();
    document.getElementById('setRentConfirmBtn').disabled = currentSetSelection.matchedIds.length === 0;
}

/** 즐겨찾기 토글(낙관적 갱신 + 실패 시 롤백). */
async function toggleSetFavorite(bundleId, ev) {
    if (ev) ev.stopPropagation();
    const b = rentBundlesData.find(x => x.bundleId === bundleId);
    if (!b) return;

    const next = !b.isFavorite;
    b.isFavorite = next;
    renderQuickSets();

    try {
        const resp = await fetch(GOOGLE_WEBAPP_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'text/plain' },
            body:    JSON.stringify({ action: 'toggleFavorite', bundleId: bundleId, isFavorite: next })
        });
        const result = await resp.json();
        if (!result || result.success === false || result.error) {
            throw new Error((result && result.error) || '실패');
        }
    } catch (e) {
        b.isFavorite = !next; // 롤백
        renderQuickSets();
        showNotification('즐겨찾기 변경 실패: ' + e.message, 'error');
    }
}
