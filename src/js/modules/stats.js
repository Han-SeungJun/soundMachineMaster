// ═══ 통계 모듈 ═══

/**
 * 대시보드 상단 stat-card 숫자 업데이트
 */
function updateStats() {
    document.getElementById('total-count').innerText     = inventoryData.length;
    document.getElementById('available-count').innerText = inventoryData.filter(i => i.status === '가용').length;
    document.getElementById('in-use-count').innerText    = inventoryData.filter(i => i.status === '대여중').length;
    document.getElementById('repair-count').innerText    = inventoryData.filter(
        i => i.status === '수리중' || i.status === '문제발견'
    ).length;
}

/**
 * 운용 통계 섹션 렌더링 (요약 카드 + 3개 차트)
 */
function initStats() {
    const locCounts  = inventoryData.reduce((acc, i) => { acc[i.location]   = (acc[i.location]   || 0) + 1; return acc; }, {});
    const depCounts  = inventoryData.reduce((acc, i) => { acc[i.department] = (acc[i.department] || 0) + 1; return acc; }, {});
    const topLoc     = Object.keys(locCounts).sort((a, b) => locCounts[b]  - locCounts[a])[0]  || '-';
    const topDep     = Object.keys(depCounts).sort((a, b) => depCounts[b]  - depCounts[a])[0]  || '-';
    const issueCount = inventoryData.filter(
        i => i.status === '수리중' || i.status === '분실' || i.status === '문제발견'
    ).length;

    // 요약 카드
    document.getElementById('stats-summary-grid').innerHTML = `
        <div class="stat-card purple">
            <div class="bg-glow" style="background:#a855f7;"></div>
            <div class="stat-icon purple"><i class="fas fa-location-dot"></i></div>
            <div class="stat-data">
                <span class="label">최다 보관 장소</span>
                <h3 style="font-size:14px;letter-spacing:-0.3px;">${topLoc}</h3>
            </div>
        </div>
        <div class="stat-card blue">
            <div class="bg-glow" style="background:#3b82f6;"></div>
            <div class="stat-icon blue"><i class="fas fa-users"></i></div>
            <div class="stat-data">
                <span class="label">최다 보유 부서</span>
                <h3 style="font-size:14px;letter-spacing:-0.3px;">${topDep}</h3>
            </div>
        </div>
        <div class="stat-card red">
            <div class="bg-glow" style="background:#ef4444;"></div>
            <div class="stat-icon red"><i class="fas fa-triangle-exclamation"></i></div>
            <div class="stat-data">
                <span class="label">리스크 장비</span>
                <h3>${issueCount}<span style="font-size:14px;font-weight:500;margin-left:3px;">건</span></h3>
            </div>
        </div>`;

    // 차트
    _renderStatusChart();
    _renderDeptPolarChart(depCounts);
    _renderLocationBarChart(locCounts);
}

function _renderStatusChart() {
    const statusCounts = inventoryData.reduce((acc, i) => {
        acc[i.status] = (acc[i.status] || 0) + 1;
        return acc;
    }, {});

    const ctx = document.getElementById('statusChart').getContext('2d');
    if (statusChartInstance) statusChartInstance.destroy();

    statusChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(statusCounts),
            datasets: [{
                data: Object.values(statusCounts),
                backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#a855f7', '#64748b'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, padding: 16 } }
            }
        }
    });
}

function _renderDeptPolarChart(depCounts) {
    const ctx = document.getElementById('deptPolarChart').getContext('2d');
    if (deptPolarChartInstance) deptPolarChartInstance.destroy();

    deptPolarChartInstance = new Chart(ctx, {
        type: 'polarArea',
        data: {
            labels: Object.keys(depCounts),
            datasets: [{
                data: Object.values(depCounts),
                backgroundColor: [
                    'rgba(99,102,241,0.6)', 'rgba(59,130,246,0.6)', 'rgba(16,185,129,0.6)',
                    'rgba(245,158,11,0.6)', 'rgba(239,68,68,0.6)',  'rgba(168,85,247,0.6)',
                    'rgba(20,184,166,0.6)'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, padding: 12 } }
            }
        }
    });
}

function _renderLocationBarChart(locCounts) {
    const ctx = document.getElementById('locationBarChart').getContext('2d');
    if (locationBarChartInstance) locationBarChartInstance.destroy();

    locationBarChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(locCounts),
            datasets: [{
                label: '보관 장비 수',
                data: Object.values(locCounts),
                backgroundColor: '#818cf8',
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } }, grid: { color: '#f8fafc' } },
                x: { ticks: { font: { size: 10 } } }
            },
            plugins: { legend: { display: false } }
        }
    });
}
