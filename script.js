// Google Form & Sheet IDs (Placeholders for User)
const GOOGLE_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSeAbW1PX3Cg9oNc3kn0p0HLTkfDDg0C1QEGHOqxbQ25Zo69Rw/viewform?usp=sharing&ouid=106361419293264327468";
const GOOGLE_SHEET_API = "https://docs.google.com/spreadsheets/d/1AWw7zH5PAGLLMgpQ5WfSN4-R7Cr2E2VeFxstQoxAU1k/gviz/tq?tqx=out:json&gid=432772852";

// Locations (Updated with user's specific locations)
const LOCATIONS = [
    "지하 1층 리바이벌 성전",
    "1층 유치부실",
    "1층 다윗의 장막",
    "1층 새가족1실",
    "1층 새가족2실",
    "2층 웨일즈성전",
    "2층 아주사성전",
    "2층 유아예배실",
    "2층 영아예배실",
    "3층 본당",
    "6층 존웨슬리홀",
    "방재실",
];

const DEPARTMENTS = ["예배팀", "방송팀", "유치부", "중고등부", "청년부", "사사모 영상팀", "본팀 음향팀"];

// Dummy Data for Preview (Updated with new fields)
let inventoryData = [
    { id: 1, name: "JBL SRX815P", category: "Speaker", status: "가용", serial: "JBL-99201", location: "지하 1층 리바이벌 성전", date: "2024-01-15", user: "홍길동", purpose: "정기예배", department: "예배팀", icon: "fa-volume-high" },
    { id: 2, name: "Shure SM58", category: "Microphone", status: "대여중", serial: "SH-88421", location: "1층 유치부실", date: "2024-02-10", user: "김철수", purpose: "공지사항", department: "유치부", icon: "fa-microphone" },
    { id: 3, name: "Yamaha CL5", category: "Mixer", status: "가용", serial: "YM-11200", location: "3층 본당", date: "2023-11-05", user: "이영희", purpose: "메인예배", department: "방송팀", icon: "fa-sliders" },
    { id: 4, name: "Sennheiser EW-D", category: "Microphone", status: "수리중", serial: "SN-44510", location: "수리실", date: "2024-02-20", user: "박민수", purpose: "마이크 교체", department: "관리팀", icon: "fa-microphone-lines" },
    { id: 5, name: "QSC K12.2", category: "Speaker", status: "가용", serial: "QS-77310", location: "2층 웨일즈성전", date: "2024-01-20", user: "정소라", purpose: "찬양연습", department: "청년부", icon: "fa-volume-high" }
];

let currentSelectedId = null;

document.addEventListener('DOMContentLoaded', () => {
    initDropdowns();
    initDashboard();
    renderInventory();
    updateStats();

    // Data Loading from Google Sheets
    if (GOOGLE_SHEET_API && GOOGLE_SHEET_API.trim() !== "") {
        fetchDataFromGS();
    }

    // Removed problematic external link event bindings
});

function initDropdowns() {
    const locSelect = document.getElementById('locationFilter');
    LOCATIONS.forEach(loc => {
        const opt = document.createElement('option');
        opt.value = loc;
        opt.innerText = loc;
        locSelect.appendChild(opt);
    });

    const depSelect = document.getElementById('departmentFilter');
    DEPARTMENTS.forEach(dep => {
        const opt = document.createElement('option');
        opt.value = dep;
        opt.innerText = dep;
        depSelect.appendChild(opt);
    });
}

function initDashboard() {
    const tableBody = document.querySelector('#recent-table tbody');
    tableBody.innerHTML = '';

    // Sort by date and take latest 5
    const recent = [...inventoryData].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

    recent.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${item.name}</strong></td>
            <td>${item.category}</td>
            <td><span class="status-tag ${getStatusClass(item.status)}">${item.status}</span></td>
            <td>${item.date}</td>
        `;
        tableBody.appendChild(row);
    });

    initCharts();
}

let categoryChartInstance = null;
let departmentChartInstance = null;

function initCharts() {
    // 1. Category Chart
    const ctxCat = document.getElementById('categoryChart').getContext('2d');
    const categoryCounts = inventoryData.reduce((acc, item) => {
        acc[item.category] = (acc[item.category] || 0) + 1;
        return acc;
    }, {});

    if (categoryChartInstance) categoryChartInstance.destroy();

    categoryChartInstance = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
            labels: Object.keys(categoryCounts),
            datasets: [{
                data: Object.values(categoryCounts),
                backgroundColor: ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#a855f7'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' }
            }
        }
    });

    // 2. Department Chart (Only in-use items)
    const inUseItems = inventoryData.filter(i => i.status === '대여중');
    const ctxDep = document.getElementById('departmentChart').getContext('2d');
    const depCounts = inUseItems.reduce((acc, item) => {
        acc[item.department] = (acc[item.department] || 0) + 1;
        return acc;
    }, {});

    if (departmentChartInstance) departmentChartInstance.destroy();

    departmentChartInstance = new Chart(ctxDep, {
        type: 'bar',
        data: {
            labels: Object.keys(depCounts),
            datasets: [{
                label: '대여 중인 장비 수',
                data: Object.values(depCounts),
                backgroundColor: '#818cf8',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderInventory(data = inventoryData) {
    const list = document.getElementById('inventory-list');
    list.innerHTML = '';

    data.forEach(item => {
        const card = document.createElement('div');
        card.className = 'gear-card hoverable';
        card.onclick = () => openModal(item.id);
        card.innerHTML = `
            <div class="gear-img">
                <i class="fas ${item.icon}"></i>
                <div class="status-overlay">
                    <span class="status-tag ${getStatusClass(item.status)}">${item.status}</span>
                </div>
            </div>
            <div class="gear-info">
                <div class="gear-category">${item.category}</div>
                <div class="gear-name">${item.name}</div>
                <div class="gear-meta">
                    <span><i class="fas fa-barcode"></i> ${item.serial}</span>
                    <span><i class="fas fa-location-dot"></i> ${item.location}</span>
                    <span><i class="fas fa-user"></i> ${item.user} (${item.department})</span>
                    <span><i class="fas fa-info-circle"></i> ${item.purpose}</span>
                    <span><i class="fas fa-calendar"></i> ${item.date}</span>
                </div>
            </div>
        `;
        list.appendChild(card);
    });
}

function updateStats() {
    document.getElementById('total-count').innerText = inventoryData.length;
    document.getElementById('available-count').innerText = inventoryData.filter(i => i.status === '가용').length;
    document.getElementById('in-use-count').innerText = inventoryData.filter(i => i.status === '대여중').length;
    document.getElementById('repair-count').innerText = inventoryData.filter(i => i.status === '수리중').length;
}

function getStatusClass(status) {
    switch (status) {
        case '가용': return 'available';
        case '대여중': return 'in-use';
        case '수리중': return 'repair';
        default: return '';
    }
}

function showSection(sectionId, element) {
    document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');

    const targetSection = document.getElementById(`${sectionId}-section`);
    if (targetSection) targetSection.style.display = 'block';

    if (element) {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        element.classList.add('active');
    }

    if (sectionId === 'inventory') {
        renderInventory();
    } else {
        initDashboard();
    }
}

function filterInventory() {
    const searchTerm = document.getElementById('gearSearch').value.toLowerCase();
    const catFilter = document.getElementById('categoryFilter').value;
    const statFilter = document.getElementById('statusFilter').value;
    const locFilter = document.getElementById('locationFilter').value;
    const depFilter = document.getElementById('departmentFilter').value;

    const filtered = inventoryData.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm) || item.serial.toLowerCase().includes(searchTerm);
        const matchesCat = catFilter === 'all' || item.category === catFilter;
        const matchesStat = statFilter === 'all' || item.status === statFilter;
        const matchesLoc = locFilter === 'all' || item.location === locFilter;
        const matchesDep = depFilter === 'all' || item.department === depFilter;
        return matchesSearch && matchesCat && matchesStat && matchesLoc && matchesDep;
    });

    renderInventory(filtered);
}

function openModal(id) {
    currentSelectedId = id;
    const item = inventoryData.find(i => i.id === id);
    if (!item) return;

    document.getElementById('modalTitle').innerText = item.name;
    const body = document.getElementById('modalBody');
    body.innerHTML = `
        <div class="modal-detail-grid">
            <div class="detail-item">
                <span class="detail-label">카테고리</span>
                <span class="detail-value">${item.category}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">상태</span>
                <span class="status-tag ${getStatusClass(item.status)}">${item.status}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">시리얼 번호</span>
                <span class="detail-value">${item.serial}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">보관장소/사용장소</span>
                <span class="detail-value">${item.location}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">사용자</span>
                <span class="detail-value">${item.user}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">부서</span>
                <span class="detail-value">${item.department}</span>
            </div>
            <div class="detail-item full-width">
                <span class="detail-label">사용 목적</span>
                <span class="detail-value">${item.purpose}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">업데이트 날짜</span>
                <span class="detail-value">${item.date}</span>
            </div>
        </div>
    `;

    // Set edit actions
    const editBtn = document.getElementById('modalEditBtn');
    if (item.editUrl && item.editUrl !== "-" && item.editUrl !== "") {
        editBtn.onclick = () => {
            closeModal();
            openFormModal(item.editUrl);
        };
        editBtn.innerHTML = "이 장비 상태 수정하기";
    } else {
        editBtn.onclick = () => {
            closeModal();
            openFormModal();
        };
        editBtn.innerHTML = "새로운 장비로 등록/변경";
    }

    document.getElementById('gearModal').classList.add('active');
}

function openFormModal(url = null) {
    const iframe = document.getElementById('formIframe');
    iframe.src = url || GOOGLE_FORM_URL;
    document.getElementById('formModalTitle').innerText = url ? "장비 상태 수정" : "새 장비 등록";
    document.getElementById('formModal').classList.add('active');
}

function closeFormModal() {
    document.getElementById('formModal').classList.remove('active');
    document.getElementById('formIframe').src = ""; // Clear to stop loading payload when hidden
    // Reload data silently to reflect any potential updates
    if (GOOGLE_SHEET_API && GOOGLE_SHEET_API.trim() !== "") {
        fetchDataFromGS();
    }
}

function closeModal() {
    document.getElementById('gearModal').classList.remove('active');
}

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function deleteItem() {
    if (!currentSelectedId) return;
    const password = prompt("장비를 삭제하려면 비밀번호를 입력하세요:");
    if (!password) return;

    const hashed = await hashPassword(password);
    const targetHash = "daa35e4f1a0e43def76e13a948cbda05be2569901fa0c6d5d6342fb2bdc85028";

    if (hashed === targetHash) {
        inventoryData = inventoryData.filter(i => i.id !== currentSelectedId);
        filterInventory();
        updateStats();
        initDashboard();
        closeModal();
        showNotification('장비가 삭제되었습니다.');
    } else {
        alert("비밀번호가 일치하지 않습니다.");
    }
}

function showNotification(msg) {
    const toast = document.getElementById('notification');
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Google Sheet Sync Logic (Using Google Visualization API for direct public access)
async function fetchDataFromGS() {
    try {
        const response = await fetch(GOOGLE_SHEET_API);
        if (!response.ok) throw new Error("네트워크 오류");

        const text = await response.text();

        // Remove unique padding from Gviz syntax (e.g., '/*O_o*/ google.visualization.Query.setResponse({"version":"0.6"...});')
        const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S\w]+)\);?/);
        if (!match) throw new Error("데이터 포맷 오류");

        const json = JSON.parse(match[1]);
        const cols = json.table.cols.map(c => c ? c.label : '');
        const rows = json.table.rows;

        const data = rows.map((row, index) => {
            let obj = { id: index + 1, icon: "fa-box" };
            row.c.forEach((cell, i) => {
                if (!cell) return;
                let val = cell.v;
                if (typeof val === 'string') val = val.trim();
                const h = cols[i] ? cols[i].toLowerCase() : "";

                if (h.includes("장비명")) obj.name = val;
                else if (h.includes("카테고리")) {
                    obj.category = val;
                    obj.icon = getIconByCategory(val);
                }
                else if (h.includes("상태")) obj.status = val;
                else if (h.includes("시리얼")) obj.serial = val;
                else if (h.includes("위치")) obj.location = val;
                else if (h.includes("사용자")) obj.user = val;
                else if (h.includes("목적")) obj.purpose = val;
                else if (h.includes("부서")) obj.department = val;
                else if (h.includes("타임스탬프") || h.includes("날짜")) {
                    obj.date = cell.f || val;
                    if (obj.date && typeof obj.date === 'string') {
                        // "2026. 2. 24" 형태로 자르기
                        const dateMatch = obj.date.match(/^(20\d{2}[\.\-\/] ?\d{1,2}[\.\-\/] ?\d{1,2})/);
                        if (dateMatch) {
                            obj.date = dateMatch[1];
                        }
                    }
                }
                else if (h.includes("링크") || h.includes("수정") || h.includes("edit")) obj.editUrl = val;
            });

            // default fills if empty
            if (!obj.name) obj.name = "-";
            if (!obj.category) obj.category = "기타";
            if (!obj.status) obj.status = "-";
            if (!obj.serial) obj.serial = "-";
            if (!obj.location) obj.location = "-";
            if (!obj.user) obj.user = "-";
            if (!obj.purpose) obj.purpose = "-";
            if (!obj.department) obj.department = "-";
            if (!obj.date) obj.date = "-";
            if (!obj.editUrl) obj.editUrl = "-";

            return obj;
        }).filter(item => item.name !== "-" && item.name !== ""); // Filter empty rows

        if (data.length > 0) {
            inventoryData = data;
            renderInventory();
            updateStats();
            initDashboard();
            showNotification('실시간 데이터가 성공적으로 동기화되었습니다.');
        } else {
            console.warn('Parsed data is empty.');
        }
    } catch (e) {
        console.error('Data pull failed: ', e);
        showNotification('네트워크 오류로 실시간 데이터를 불러올 수 없습니다.');
    }
}

function getIconByCategory(category) {
    if (!category) return "fa-box";
    const cat = category.toLowerCase();
    if (cat.includes("스피커") || cat.includes("speaker")) return "fa-volume-high";
    if (cat.includes("마이크") || cat.includes("mic")) return "fa-microphone";
    if (cat.includes("믹서") || cat.includes("mixer")) return "fa-sliders";
    if (cat.includes("케이블") || cat.includes("cable")) return "fa-link";
    return "fa-box";
}
