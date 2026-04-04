// ═══ 대시보드 모듈 ═══

/**
 * 대시보드 섹션 렌더링 (최근 장비 테이블 + 차트 + 이슈 배너)
 */
function initDashboard() {
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
