// ═══ 커스텀 세트 구성 모듈 ═══
// 정의된 세트를 그대로 쓰지 않고 가용 장비를 직접 담아 대여할 수 있게 한다.
// 선택 결과를 세트 대여와 동일한 형태(currentSetSelection)로 만들기 때문에
// confirmSetRent()의 대여/기록 흐름은 그대로 재사용된다.

const CUSTOM_LIST_LIMIT = 60; // 한 번에 그리는 최대 장비 수 (나머지는 검색으로 좁힌다)

// ── 커스텀 모드 토글 ──────────────────────────────────────────────────────────

/** 대시보드 "커스텀 대여" 진입점 — 모달을 열고 바로 커스텀 목록을 펼친다. */
function openCustomSetRent() {
    openSetRentModal();
    setCustomMode(true);
}

function setCustomMode(on) {
    const area = document.getElementById('setCustomArea');
    const btn  = document.getElementById('setCustomToggleBtn');
    if (!area) return;
    area.hidden = !on;
    if (btn) btn.classList.toggle('on', !!on);
    if (on) renderCustomPicker();
}

function toggleCustomMode() {
    const area = document.getElementById('setCustomArea');
    if (!area) return;
    setCustomMode(area.hidden);
}

/** 모달을 열고 닫을 때 커스텀 상태를 초기화한다. */
function resetCustomPicker() {
    customPickIds = [];
    const search = document.getElementById('setCustomSearch');
    if (search) search.value = '';
    setCustomMode(false);
    updateCustomCount();
}

/** 선택된 세트/묶음의 매칭 결과를 커스텀 선택으로 옮겨 편집을 시작한다. */
function customizeCurrentSet() {
    if (!currentSetSelection) return;
    customPickIds = currentSetSelection.matchedIds.slice();
    applyCustomSelection();
    setCustomMode(true);
    const area = document.getElementById('setCustomArea');
    if (area && area.scrollIntoView) area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── 선택 상태 ─────────────────────────────────────────────────────────────────

function isCustomPicked(id) {
    return customPickIds.some(x => String(x) === String(id));
}

/** 장비 하나를 담거나 뺀다(불변 갱신). */
function toggleCustomItem(id) {
    customPickIds = isCustomPicked(id)
        ? customPickIds.filter(x => String(x) !== String(id))
        : customPickIds.concat([id]);
    applyCustomSelection();
    renderCustomPicker();
}

/**
 * 담아둔 장비 ID들로 대여 선택 객체를 만든다.
 * 같은 장비명·카테고리끼리 묶어 세트 대여와 같은 detail 구조를 갖춘다.
 * @param {Array} ids
 * @returns {{setId, setName, team, matchedIds, shortages, detail, components, custom}}
 */
function buildCustomSelection(ids) {
    const groups = [];
    ids.forEach(id => {
        const item = inventoryData.find(i => String(i.id) === String(id));
        if (!item) return;
        const category = item.category || '';
        let group = groups.find(g => g.itemName === item.name && g.category === category);
        if (!group) {
            group = { itemName: item.name, category, need: 0, have: 0, missing: false, ids: [] };
            groups.push(group);
        }
        group.ids.push(item.id);
        group.need++;
        group.have++;
    });

    return {
        // 정의된 세트가 아니므로 SetID/SetName은 비운다(묶음도 즉석 묶음으로 기록된다).
        setId: '', setName: '', team: '',
        matchedIds: groups.reduce((acc, g) => acc.concat(g.ids), []),
        shortages:  [],
        detail:     groups,
        components: groups.map(g => ({ quantity: g.need })),
        custom:     true
    };
}

/** 커스텀 선택을 현재 대여 선택으로 반영하고 관련 UI를 갱신한다. */
function applyCustomSelection() {
    currentSetSelection = customPickIds.length ? buildCustomSelection(customPickIds) : null;

    renderSetList();
    if (currentSetSelection) {
        renderSetComponents();
    } else {
        const area = document.getElementById('setCompList');
        if (area) area.innerHTML =
            '<div class="set-comp-empty">담은 장비가 없습니다. 아래에서 장비를 골라주세요.</div>';
    }

    const btn = document.getElementById('setRentConfirmBtn');
    if (btn) btn.disabled = !currentSetSelection || currentSetSelection.matchedIds.length === 0;

    updateCustomCount();
}

function updateCustomCount() {
    const count = document.getElementById('setCustomCount');
    if (count) count.textContent = `${customPickIds.length}대 담김`;
}

// ── 장비 목록 렌더링 ──────────────────────────────────────────────────────────

/** 가용 장비를 검색어로 걸러 담기/빼기 버튼으로 렌더링한다. */
function renderCustomPicker() {
    const list = document.getElementById('setCustomList');
    if (!list) return;

    const searchEl = document.getElementById('setCustomSearch');
    const query    = (searchEl ? searchEl.value : '').toLowerCase().trim();

    // 이미 담은 장비는 상태가 바뀌어도 목록에 남겨야 뺄 수 있다.
    const available = inventoryData.filter(i =>
        (i.status || '').trim() === '가용' || isCustomPicked(i.id));
    const filtered = query
        ? available.filter(i =>
            (i.name || '').toLowerCase().includes(query) ||
            (i.category || '').toLowerCase().includes(query) ||
            (i.location || '').toLowerCase().includes(query))
        : available;

    updateCustomCount();

    if (!filtered.length) {
        list.innerHTML = `<div class="set-list-empty">${
            query ? '검색 결과가 없습니다.' : '지금 대여할 수 있는 가용 장비가 없습니다.'}</div>`;
        return;
    }

    const shown = filtered.slice(0, CUSTOM_LIST_LIMIT);
    const rest  = filtered.length - shown.length;

    list.innerHTML = shown.map(item => {
        const on = isCustomPicked(item.id);
        return `<button type="button" class="set-custom-item${on ? ' on' : ''}"
                        onclick="toggleCustomItem('${escapeAttrArg(item.id)}')">
            <span class="sci-check"><i class="fas ${on ? 'fa-circle-check' : 'fa-circle-plus'}"></i></span>
            <span class="sci-body">
                <span class="sci-name">${escapeHtml(item.name)}</span>
                <span class="sci-meta">${escapeHtml(item.category || '')}${
                    item.location && item.location !== '-' ? ` · ${escapeHtml(item.location)}` : ''}</span>
            </span>
        </button>`;
    }).join('') + (rest > 0
        ? `<div class="set-custom-more">외 ${rest}대 — 검색으로 좁혀보세요.</div>`
        : '');
}
