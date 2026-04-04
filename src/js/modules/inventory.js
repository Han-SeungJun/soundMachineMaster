// ═══ 인벤토리 모듈 ═══

/**
 * 위치/부서 필터 드롭다운 초기화
 */
function initDropdowns() {
    const locSel = document.getElementById('locationFilter');
    LOCATIONS.forEach(loc => {
        const o = document.createElement('option');
        o.value = loc; o.innerText = loc;
        locSel.appendChild(o);
    });

    const depSel = document.getElementById('departmentFilter');
    DEPARTMENTS.forEach(dep => {
        const o = document.createElement('option');
        o.value = dep; o.innerText = dep;
        depSel.appendChild(o);
    });
}

/**
 * 현재 필터/정렬 조건으로 인벤토리 렌더링
 * @param {Array|undefined} data - 전달 시 해당 데이터로, 없으면 getFilteredData() 사용
 */
function renderInventory(data) {
    if (data === undefined) data = getFilteredData();
    const container = document.getElementById('inventory-list');
    document.getElementById('result-count').innerText = `${data.length}건`;

    if (data.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-magnifying-glass"></i>
                <h3>검색 결과가 없습니다</h3>
                <p>다른 검색어나 필터를 사용해보세요.</p>
            </div>`;
        return;
    }

    if (currentView === 'grid') {
        _renderGridView(container, data);
    } else {
        _renderListView(container, data);
    }
}

function _renderGridView(container, data) {
    container.innerHTML = '';
    container.className = 'inventory-grid';

    data.forEach(item => {
        const noteCount  = getNoteCount(item.id);
        const accentClass = getStatusClass(item.status) || 'default';
        const bgClass    = getBgClass(item.icon);
        const card       = document.createElement('div');

        card.className = 'gear-card';
        card.onclick   = () => openModal(item.id);
        card.innerHTML = `
            <div class="gear-accent ${accentClass}"></div>
            <div class="gear-icon-area ${bgClass}">
                <i class="fas ${item.icon}"></i>
                ${noteCount > 0 ? `<div class="gear-note-dot" title="${noteCount}개 기록">${noteCount}</div>` : ''}
                <div class="gear-status-overlay">
                    <span class="status-tag ${accentClass}">${item.status}</span>
                </div>
            </div>
            <div class="gear-body">
                <div class="gear-cat">${item.category}</div>
                <div class="gear-name">${item.name}</div>
                <div class="gear-meta">
                    <div class="gear-meta-row"><i class="fas fa-location-dot"></i>${item.location}</div>
                    <div class="gear-meta-row"><i class="fas fa-user"></i>${item.user} · ${item.department}</div>
                    <div class="gear-meta-row"><i class="fas fa-tag"></i>${item.purpose}</div>
                </div>
            </div>`;
        container.appendChild(card);
    });
}

function _renderListView(container, data) {
    container.className = '';
    const noteCol = data.some(i => getNoteCount(i.id) > 0);

    container.innerHTML = `
        <div class="card" style="padding:0; overflow:hidden;">
            <table class="list-table">
                <thead>
                    <tr>
                        <th>장비명</th>
                        <th>카테고리</th>
                        <th>상태</th>
                        <th>위치</th>
                        <th>부서</th>
                        <th>날짜</th>
                        ${noteCol ? '<th>기록</th>' : ''}
                    </tr>
                </thead>
                <tbody>
                    ${data.map(item => {
                        const nc  = getNoteCount(item.id);
                        const bgc = getBgClass(item.icon);
                        return `<tr onclick="openModal(${item.id})">
                            <td>
                                <div class="name-cell">
                                    <div class="mini-icon ${bgc}"><i class="fas ${item.icon}"></i></div>
                                    <strong>${item.name}</strong>
                                </div>
                            </td>
                            <td style="color:var(--text-muted);font-size:12.5px;">${item.category}</td>
                            <td><span class="status-tag ${getStatusClass(item.status)}">${item.status}</span></td>
                            <td style="font-size:12.5px;color:var(--text-muted);max-width:140px;overflow:hidden;text-overflow:ellipsis;">${item.location}</td>
                            <td style="font-size:12.5px;color:var(--text-muted);">${item.department}</td>
                            <td style="font-size:12px;color:var(--text-muted);">${item.date}</td>
                            ${noteCol ? `<td>${nc > 0 ? `<span class="list-note-badge"><i class="fas fa-note-sticky"></i>${nc}</span>` : ''}</td>` : ''}
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
}

/**
 * 현재 검색어/필터/정렬 조건으로 데이터 필터링 후 반환
 * @returns {Array}
 */
function getFilteredData() {
    const search = (document.getElementById('gearSearch')?.value || '').toLowerCase();
    const cat    = document.getElementById('categoryFilter')?.value || 'all';
    const loc    = document.getElementById('locationFilter')?.value || 'all';
    const dep    = document.getElementById('departmentFilter')?.value || 'all';
    const sortBy = document.getElementById('sortSelect')?.value || 'default';

    let data = inventoryData.filter(item => {
        const matchSearch = item.name.toLowerCase().includes(search) || item.category.toLowerCase().includes(search);
        const matchCat    = cat === 'all' || item.category === cat;
        const matchStat   = currentStatusPill === 'all'
            || (Array.isArray(currentStatusPill)
                ? currentStatusPill.includes(item.status)
                : item.status === currentStatusPill);
        const matchLoc = loc === 'all' || item.location === loc;
        const matchDep = dep === 'all' || item.department === dep;
        return matchSearch && matchCat && matchStat && matchLoc && matchDep;
    });

    if (sortBy === 'name')     data = [...data].sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === 'status')   data = [...data].sort((a, b) => a.status.localeCompare(b.status));
    if (sortBy === 'category') data = [...data].sort((a, b) => a.category.localeCompare(b.category));
    if (sortBy === 'date')     data = [...data].sort((a, b) => new Date(b.date) - new Date(a.date));

    return data;
}

/**
 * 검색어 입력 시 필터 실행 (인벤토리 섹션으로 자동 이동)
 */
function filterInventory() {
    const search = document.getElementById('gearSearch')?.value?.toLowerCase() || '';
    if (search.length > 0 && document.getElementById('inventory-section').style.display === 'none') {
        showSection('inventory', document.querySelectorAll('.nav-item')[1]);
        setTimeout(() => document.getElementById('gearSearch').focus(), 10);
    }
    renderInventory();
}

/**
 * 상태 필터 pill 클릭 핸들러
 * @param {string} status
 * @param {Element} el
 */
function filterByStatusPill(status, el) {
    currentStatusPill = status;
    document.querySelectorAll('.spill').forEach(b => b.classList.remove('on'));
    if (el) el.classList.add('on');
    if (document.getElementById('inventory-section').style.display === 'none') {
        showSection('inventory', document.querySelectorAll('.nav-item')[1]);
    }
    filterInventory();
}

/**
 * 이슈 배너 클릭: 수리중 + 문제발견 동시 필터
 */
function filterByIssueBanner() {
    const issueStatuses = ['수리중', '문제발견'];
    currentStatusPill = issueStatuses;
    document.querySelectorAll('.spill').forEach(b => {
        b.classList.toggle('on', issueStatuses.includes(b.textContent.trim()));
    });
    if (document.getElementById('inventory-section').style.display === 'none') {
        showSection('inventory', document.querySelectorAll('.nav-item')[1]);
    }
    filterInventory();
}

/**
 * 그리드 ↔ 리스트 뷰 전환
 * @param {'grid'|'list'} type
 */
function toggleView(type) {
    currentView = type;
    document.getElementById('vbtn-grid').classList.toggle('on', type === 'grid');
    document.getElementById('vbtn-list').classList.toggle('on', type === 'list');
    renderInventory();
}
