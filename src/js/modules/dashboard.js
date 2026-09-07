// ═══ 대시보드 모듈 ═══

/**
 * 대시보드 섹션 렌더링 (최근 장비 테이블 + 차트 + 이슈 배너)
 */
function initDashboard() {
    renderDashboardSets();
    _renderRecentTable();
    initCharts();
    _updateIssueBanner();
}

function _renderRecentTable() {
    const tbody  = document.querySelector('#recent-table tbody');
    tbody.innerHTML = '';

    const recent = [...inventoryData]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 8);

    recent.forEach(item => {
        const row     = document.createElement('tr');
        row.onclick   = () => openModal(item.id);
        row.innerHTML = `
            <td><strong>${item.name}</strong></td>
            <td><span style="font-size:12px;color:var(--text-muted);">${item.category}</span></td>
            <td><span class="status-tag ${getStatusClass(item.status)}">${item.status}</span></td>
            <td style="color:var(--text-muted);font-size:12.5px;">${item.date}</td>
        `;
        tbody.appendChild(row);
    });
}

function _updateIssueBanner() {
    const issueItems = inventoryData.filter(
        i => i.status === '수리중' || i.status === '분실' || i.status === '문제발견'
    );
    const banner = document.getElementById('issueBanner');
    document.getElementById('issueCount').innerText = issueItems.length;
    banner.style.display = issueItems.length > 0 ? 'flex' : 'none';
}

/**
 * 대시보드 차트(카테고리 도넛, 부서별 바차트) 초기화/갱신
 */
function initCharts() {
    _renderCategoryChart();
    _renderDepartmentChart();
}

function _renderCategoryChart() {
    const catCounts = inventoryData.reduce((acc, i) => {
        acc[i.category] = (acc[i.category] || 0) + 1;
        return acc;
    }, {});

    const ctx = document.getElementById('categoryChart').getContext('2d');
    if (categoryChartInstance) categoryChartInstance.destroy();

    categoryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(catCounts),
            datasets: [{
                data: Object.values(catCounts),
                backgroundColor: ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ef4444', '#64748b'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 10 } }
            }
        }
    });
}

function _renderDepartmentChart() {
    const inUse    = inventoryData.filter(i => i.status === '대여중');
    const depCounts = inUse.reduce((acc, i) => {
        acc[i.department] = (acc[i.department] || 0) + 1;
        return acc;
    }, {});

    const ctx = document.getElementById('departmentChart').getContext('2d');
    if (departmentChartInstance) departmentChartInstance.destroy();

    departmentChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(depCounts),
            datasets: [{
                label: '대여중',
                data: Object.values(depCounts),
                backgroundColor: '#818cf8',
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } }, grid: { color: '#f1f5f9' } },
                x: { ticks: { font: { size: 10 } } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

// ── 대시보드 세트 대여 (홈에서 바로 세트/커스텀 대여) ─────────────────────────

const DASH_SET_TILE_LIMIT  = 6; // 홈에 노출할 세트 타일 수 (나머지는 "전체 세트"로)
const DASH_QUICK_CHIP_LIMIT = 4; // 즐겨찾기/최근 묶음 칩 수

/**
 * 홈 화면의 세트 대여 카드를 렌더링한다.
 * 세트가 정의되기 전이거나 인벤토리가 아직 안 왔어도 커스텀 대여는 항상 열어 둔다.
 */
function renderDashboardSets() {
    const area = document.getElementById('dashSetsArea');
    if (!area) return;

    const sets = (typeof setsData !== 'undefined' ? setsData : []).slice(0, DASH_SET_TILE_LIMIT);
    const hint = sets.length ? '' : `<div class="dash-sets-empty">
        정의된 세트가 아직 없습니다. 아래 커스텀으로 바로 대여하거나 시트 관리에서 세트를 만들어보세요.
    </div>`;

    area.innerHTML = _dashQuickChips() + hint + _dashSetTiles(sets);
}

/** 즐겨찾기·최근 묶음을 칩으로 — 한 번 탭하면 그 구성 그대로 다시 대여. */
function _dashQuickChips() {
    if (typeof rentBundlesData === 'undefined' || !rentBundlesData.length) return '';

    const user = (localStorage.getItem('lastRentUser') || '').trim();
    const mine = user ? rentBundlesData.filter(b => b.userName === user) : rentBundlesData;
    const list = dedupeBundles(mine.length ? mine : rentBundlesData)
        .sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0))
        .slice(0, DASH_QUICK_CHIP_LIMIT);
    if (!list.length) return '';

    const chips = list.map(b => {
        const count = (b.itemNames || '').split('|').filter(Boolean).length;
        const label = b.setName || `${count}종 묶음`;
        return `<button type="button" class="dash-quick-chip" onclick="openBundleRent('${escapeAttrArg(b.bundleId)}')">
            <i class="fas ${b.isFavorite ? 'fa-star fav' : 'fa-rotate-left'}"></i>
            ${escapeHtml(label)} <em>${count}대</em>
        </button>`;
    }).join('');

    return `<div class="dash-sets-row-label"><i class="fas fa-bolt"></i> 다시 대여</div>
            <div class="dash-quick-row">${chips}</div>`;
}

/** 세트 타일 + 항상 마지막에 오는 커스텀 타일. */
function _dashSetTiles(sets) {
    const tiles = sets.map(set => {
        const res   = resolveSetUnits(set.setId);
        const total = res.components.reduce((sum, c) => sum + (c.quantity || 1), 0);
        const have  = res.matchedIds.length;
        const short = res.shortages.length > 0;
        // 색상은 시트 값이라 그대로 속성에 넣지 않는다 (#rrggbb 형태만 허용).
        const color = /^#[0-9a-fA-F]{3,8}$/.test(set.color || '') ? set.color : '';
        const style = color ? `background:${color}1a;color:${color};` : '';
        return `<button type="button" class="dash-set-tile" onclick="openSetRentModal('${escapeAttrArg(set.setId)}')">
            <span class="dst-icon" style="${style}"><i class="fas ${escapeHtml(set.icon || 'fa-box')}"></i></span>
            <span class="dst-body">
                <span class="dst-name">${escapeHtml(set.setName)}</span>
                <span class="dst-meta">${escapeHtml(set.team || '공용')}</span>
            </span>
            <span class="dst-avail ${short ? 'short' : 'ok'}">${have}/${total}</span>
        </button>`;
    }).join('');

    const customTile = `<button type="button" class="dash-set-tile custom" onclick="openCustomSetRent()">
        <span class="dst-icon"><i class="fas fa-sliders"></i></span>
        <span class="dst-body">
            <span class="dst-name">커스텀 대여</span>
            <span class="dst-meta">장비를 직접 담아서</span>
        </span>
        <span class="dst-arrow"><i class="fas fa-arrow-right"></i></span>
    </button>`;

    return `<div class="dash-sets-row-label"><i class="fas fa-boxes-packing"></i> 세트</div>
            <div class="dash-set-tiles">${tiles}${customTile}</div>`;
}
