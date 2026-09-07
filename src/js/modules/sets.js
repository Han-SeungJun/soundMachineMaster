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
    renderDashboardSets();
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
    renderDashboardSets();
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
        const units = inventoryData.filter(inv =>
            inv.name === c.itemName && (!c.category || inv.category === c.category));
        const avail = units.filter(inv =>
            (inv.status || '').trim() === '가용' && !usedIds.has(inv.id));
        const take = avail.slice(0, need);
        take.forEach(u => { usedIds.add(u.id); matchedIds.push(u.id); });

        // 재고에 아예 없는 이름(오타·삭제된 장비)과 단순 부족을 구분한다.
        const missing = units.length === 0;
        if (take.length < need) shortages.push({ itemName: c.itemName, need, have: take.length, missing });
        detail.push({ itemName: c.itemName, category: c.category, need, have: take.length, missing, ids: take.map(u => u.id) });
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
        const units = inventoryData.filter(inv => inv.name === name);
        const avail = units.filter(inv =>
            (inv.status || '').trim() === '가용' && !usedIds.has(inv.id));
        const take = avail.slice(0, need);
        take.forEach(u => { usedIds.add(u.id); matchedIds.push(u.id); });

        const missing = units.length === 0;
        if (take.length < need) shortages.push({ itemName: name, need, have: take.length, missing });
        detail.push({ itemName: name, category: '', need, have: take.length, missing, ids: take.map(u => u.id) });
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

/**
 * 세트 대여 모달을 연다.
 * @param {string} [preselectSetId] - 대시보드 세트 타일에서 바로 들어올 때 미리 고를 세트
 */
function openSetRentModal(preselectSetId) {
    currentSetSelection = null;
    resetCustomPicker();

    const today = new Date();
    document.getElementById('setRentDate').value =
        `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    document.getElementById('setRentPurpose').value = '';
    const searchEl = document.getElementById('setSearchInput');
    if (searchEl) searchEl.value = '';

    populateSetDeptSelect();
    setUserPickerValue('setRentUserPicker', localStorage.getItem('lastRentUser') || '');

    renderQuickSets();
    renderSetList();
    document.getElementById('setCompList').innerHTML =
        '<div class="set-comp-empty">세트를 선택하거나 아래 커스텀에서 장비를 직접 담아보세요.</div>';
    document.getElementById('setRentConfirmBtn').disabled = true;

    document.getElementById('setRentModal').classList.add('active');

    if (preselectSetId) selectSet(preselectSetId);
}

function closeSetRentModal() {
    document.getElementById('setRentModal').classList.remove('active');
    currentSetSelection = null;
    resetCustomPicker();
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
                return `<button class="set-card-btn ${on ? 'on' : ''}" onclick="selectSet('${escapeAttrArg(s.setId)}')">
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
    customPickIds = [];   // 세트를 새로 고르면 커스텀 편집분은 버린다
    setCustomMode(false);
    renderSetList();
    renderSetComponents();
    document.getElementById('setRentConfirmBtn').disabled = currentSetSelection.matchedIds.length === 0;
}

/**
 * 부족/미등록 구성에 대한 경고 문구를 만든다.
 * '미등록'은 재고에 그 이름이 아예 없다는 뜻이라 시트 오타를 의심해야 한다.
 * @param {{shortages:Array, matchedIds:Array}} sel
 * @returns {string} HTML
 */
function renderSetShortageWarn(sel) {
    if (!sel.shortages.length) return '';
    const missing = sel.shortages.filter(s => s.missing);
    const short   = sel.shortages.filter(s => !s.missing);
    const lines   = [];
    if (short.length) lines.push(`부족 ${short.length}종`);
    if (missing.length) {
        lines.push(`미등록 ${missing.length}종(${missing.map(m => escapeHtml(m.itemName)).join(', ')}) — 세트 구성의 장비명이 재고와 다릅니다`);
    }
    return `<div class="set-comp-warn">
        <i class="fas fa-triangle-exclamation"></i>
        ${lines.join(' · ')} — 가용분(${sel.matchedIds.length}대)만 대여됩니다.
    </div>`;
}

/**
 * 선택된 세트의 구성 장비별 가용/부족 배지를 렌더링한다.
 */
function renderSetComponents() {
    const area = document.getElementById('setCompList');
    const sel  = currentSetSelection;
    if (!area) return;
    if (!sel) { area.innerHTML = ''; return; }

    const title = sel.custom ? '커스텀 구성' : (sel.setName || '선택한 묶음');
    // 커스텀 편집 중에는 아래 커스텀 목록이 그 역할을 하므로 버튼을 중복 노출하지 않는다.
    const customizeBtn = sel.custom ? '' :
        `<button type="button" class="set-comp-customize" onclick="customizeCurrentSet()">
            <i class="fas fa-sliders"></i> 이 구성 커스텀하기
        </button>`;

    area.innerHTML = `
        <div class="set-comp-head">
            <span>${escapeHtml(title)} 구성 장비 <em>${sel.matchedIds.length}대</em></span>
            ${customizeBtn}
        </div>
        ${sel.detail.map(d => {
            const ok    = d.have >= d.need;
            const state = ok ? 'ok' : (d.missing ? 'missing' : 'short');
            const label = ok ? '가용' : (d.missing ? '미등록' : '부족');
            return `<div class="set-comp-row ${ok ? '' : 'short'}">
                <span class="set-comp-name">${escapeHtml(d.itemName)}${d.category ? ` <em>${escapeHtml(d.category)}</em>` : ''}</span>
                <span class="set-comp-badge ${state}">${label} ${d.have}/${d.need}</span>
            </div>`;
        }).join('')}
        ${renderSetShortageWarn(sel)}`;
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
        showNotification('사용자를 선택해주세요.', 'error');
        openUserPicker('setRentUserPicker');
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

    const succeeded   = (result && result.succeeded) ? result.succeeded.map(String) : sel.matchedIds.map(String);
    const failedNames = (result && result.failedNames) ? result.failedNames : [];
    const failedN     = (result && result.failed) ? result.failed.length : 0;

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
    // 실패 건은 개수만 알려주면 무엇을 다시 빌려야 할지 알 수 없어 장비명을 함께 표시한다.
    const failText = failedN
        ? ` · 실패 ${failedN}건${failedNames.length ? ` (${failedNames.join(', ')})` : ''}`
        : '';
    showNotification(
        `세트 대여 완료: 성공 ${succeeded.length}건${failText}`,
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
            <button class="quick-chip-main" onclick="reRentBundle('${escapeAttrArg(b.bundleId)}')" title="이 묶음으로 다시 대여">
                <i class="fas fa-rotate-left"></i> ${escapeHtml(label)} <em>${cnt}대</em>
            </button>
            <button class="quick-chip-fav ${b.isFavorite ? 'on' : ''}" onclick="toggleSetFavorite('${escapeAttrArg(b.bundleId)}', event)" title="즐겨찾기">
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

    if (b.purpose) document.getElementById('setRentPurpose').value = b.purpose;
    populateSetDeptSelect();
    if (b.userName)   setUserPickerValue('setRentUserPicker', b.userName);
    if (b.department) document.getElementById('setRentDepartment').value = b.department;

    const names = (b.itemNames || '').split('|').map(s => s.trim()).filter(Boolean);
    currentSetSelection = resolveAdhocUnits(names, b);
    customPickIds = [];   // 묶음을 새로 고르면 커스텀 편집분은 버린다
    setCustomMode(false);
    renderSetList();
    renderSetComponents();
    document.getElementById('setRentConfirmBtn').disabled = currentSetSelection.matchedIds.length === 0;
}

/** 대시보드 칩에서 바로 들어올 때 — 모달을 열고 그 묶음을 적용한다. */
function openBundleRent(bundleId) {
    openSetRentModal();
    reRentBundle(bundleId);
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
