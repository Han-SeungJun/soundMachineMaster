// ═══ 히스토리 캘린더 모듈 ═══

let historyData      = [];
let calendarYear     = new Date().getFullYear();
let calendarMonth    = new Date().getMonth();
let calHistoryFilter = { category: 'all', department: 'all', search: '' };

// ─ 초기화 ──────────────────────────────────────────────────

/**
 * 히스토리 섹션 진입 시 초기화 (데이터 로드 + 캘린더 렌더링)
 */
async function initHistorySection() {
    _initCalDepartmentFilter();

    const grid = document.getElementById('calendarGrid');
    if (grid) {
        grid.innerHTML = `<div class="cal-loading"><i class="fas fa-spinner"></i>히스토리를 불러오는 중...</div>`;
    }

    if (!HISTORY_SHEET_URL) {
        if (grid) grid.innerHTML = `<div class="empty-state"><i class="fas fa-calendar-xmark"></i><h3>History 시트 URL 미설정</h3><p>config.js의 HISTORY_SHEET_URL을 확인하세요.</p></div>`;
        return;
    }

    await fetchHistoryData();
    renderCalendar();
}

function _initCalDepartmentFilter() {
    const sel = document.getElementById('calDepartmentFilter');
    if (!sel || sel.options.length > 1) return; // 이미 초기화됨
    DEPARTMENTS.forEach(dep => {
        const o = document.createElement('option');
        o.value = dep; o.textContent = dep;
        sel.appendChild(o);
    });
}

// ─ 데이터 로드 ──────────────────────────────────────────────

/**
 * History 시트 gviz/tq → historyData 배열 갱신
 */
async function fetchHistoryData() {
    try {
        const res = await fetch(HISTORY_SHEET_URL);
        if (!res.ok) throw new Error('네트워크 오류');

        const text  = await res.text();
        const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S\w]+)\);?/);
        if (!match) throw new Error('데이터 포맷 오류');

        const json = JSON.parse(match[1]);
        const cols = json.table.cols.map(c => c ? c.label : '');
        const rows = json.table.rows;

        historyData = rows.map(row => {
            const obj = {};
            row.c.forEach((cell, i) => {
                if (!cell) return;
                const val = (cell.f != null ? cell.f : cell.v);
                const str = (typeof val === 'string') ? val.trim() : String(val ?? '').trim();
                const h   = (cols[i] || '').toLowerCase();

                // ※ '사용 날짜'를 먼저 확인해야 '사용자', '사용 부서'와 충돌 없음
                if      (h.includes('사용 날짜') || h === '사용날짜') {
                    obj.dateRange = str;
                    const parsed  = _parseUsageDate(str);
                    obj.startDate = parsed.start;
                    obj.endDate   = parsed.end;
                }
                else if (h === '장비명'   || h.includes('장비명'))    obj.name       = str;
                else if (h === '카테고리' || h.includes('카테고리'))   obj.category   = str;
                else if (h === '상태'     || h.includes('상태'))       obj.status     = str;
                else if (h === '위치'     || h.includes('위치'))       obj.location   = str;
                else if (h.includes('사용자'))                         obj.user       = str;
                else if (h.includes('목적'))                           obj.purpose    = str;
                else if (h.includes('부서'))                           obj.department = str;
                else if (h.includes('수정'))                           obj.editUrl    = str;
                else if (h.includes('사용일시') || h === '타임스탬프') obj.timestamp  = str;
            });
            return obj;
        }).filter(item => item.name && item.startDate);

    } catch (e) {
        console.error('History fetch failed:', e);
        showNotification('히스토리 데이터를 불러올 수 없습니다.', 'error');
    }
}

/**
 * "YYYY.MM.DD ~ YYYY.MM.DD" 또는 "YYYY-MM-DD ~ YYYY-MM-DD" 형식 파싱
 * 단일 날짜인 경우 start = end
 * @param {string} str
 * @returns {{ start: Date|null, end: Date|null }}
 */
function _parseUsageDate(str) {
    if (!str || str === '-') return { start: null, end: null };

    const parts = str.split(/\s*[~–—]\s*/);

    const parseOne = (s) => {
        if (!s) return null;
        const cleaned = s.trim().replace(/\./g, '-').replace(/\//g, '-');
        const m = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (!m) return null;
        const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
        return isNaN(d.getTime()) ? null : d;
    };

    if (parts.length >= 2) {
        const start = parseOne(parts[0]);
        const end   = parseOne(parts[1]);
        return { start, end: end || start };
    }
    const d = parseOne(parts[0]);
    return { start: d, end: d };
}

// ─ 필터 ────────────────────────────────────────────────────

function filterHistory() {
    calHistoryFilter.category   = document.getElementById('calCategoryFilter')?.value   || 'all';
    calHistoryFilter.department = document.getElementById('calDepartmentFilter')?.value || 'all';
    calHistoryFilter.search     = (document.getElementById('calSearch')?.value || '').toLowerCase();
    renderCalendar();
}

function _getFilteredHistory() {
    return historyData.filter(item => {
        const matchCat  = calHistoryFilter.category   === 'all' || item.category   === calHistoryFilter.category;
        const matchDep  = calHistoryFilter.department === 'all' || item.department === calHistoryFilter.department;
        const matchSrch = !calHistoryFilter.search    || (item.name || '').toLowerCase().includes(calHistoryFilter.search);
        return matchCat && matchDep && matchSrch;
    });
}

// ─ 달력 네비게이션 ─────────────────────────────────────────

function prevMonth() {
    calendarMonth--;
    if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
    renderCalendar();
}

function nextMonth() {
    calendarMonth++;
    if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
    renderCalendar();
}

function goToToday() {
    calendarYear  = new Date().getFullYear();
    calendarMonth = new Date().getMonth();
    renderCalendar();
}

// ─ 달력 렌더링 ─────────────────────────────────────────────

/**
 * 현재 calendarYear / calendarMonth 기준으로 달력을 그린다.
 */
function renderCalendar() {
    const titleEl = document.getElementById('calendarMonthTitle');
    if (titleEl) titleEl.textContent = `${calendarYear}년 ${calendarMonth + 1}월`;

    const grid = document.getElementById('calendarGrid');
    if (!grid) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDay  = new Date(calendarYear, calendarMonth, 1);
    const lastDay   = new Date(calendarYear, calendarMonth + 1, 0);

    // 달력 표시 시작(첫 주의 일요일) ~ 종료(마지막 주의 토요일)
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

    const filteredData = _getFilteredHistory();
    let html = '';
    let cur  = new Date(startDate);

    while (cur <= endDate) {
        const weekStart = new Date(cur);
        const weekEnd   = new Date(cur);
        weekEnd.setDate(weekEnd.getDate() + 6);

        // 이번 주 7일
        const days = [];
        for (let d = 0; d < 7; d++) {
            const day = new Date(cur);
            day.setDate(cur.getDate() + d);
            days.push(day);
        }

        // 이번 주와 겹치는 이벤트 + 슬롯 배정
        const weekEvents    = filteredData.filter(item =>
            item.startDate && item.endDate &&
            item.startDate <= weekEnd && item.endDate >= weekStart
        );
        const slottedEvents = _assignEventSlots(weekEvents, weekStart, weekEnd);

        html += `<div class="cal-week-row">`;

        // ── 날짜 번호 행 ──────────────────────────────────
        html += `<div class="cal-days-num-row">`;
        days.forEach((day, i) => {
            const isToday      = day.getTime() === today.getTime();
            const isOtherMonth = day.getMonth() !== calendarMonth;
            let cls = 'cal-day-num-cell';
            if (isToday)      cls += ' today';
            if (isOtherMonth) cls += ' other-month';
            if (i === 0)      cls += ' sunday';
            if (i === 6)      cls += ' saturday';
            html += `<div class="${cls}"><span class="cal-day-num">${day.getDate()}</span></div>`;
        });
        html += `</div>`;

        // ── 이벤트 바 행들 ────────────────────────────────
        if (slottedEvents.length > 0) {
            html += `<div class="cal-events-grid">`;
            slottedEvents.forEach(({ colStart, colEnd, slot, item }) => {
                const catCls = _getCategoryColorClass(item.category);
                const span   = colEnd - colStart + 1;
                const isStartInWeek = item.startDate >= weekStart;
                const isEndInWeek   = item.endDate   <= weekEnd;
                let evCls = `cal-event-bar ${catCls}`;
                if (!isStartInWeek) evCls += ' continues-left';
                if (!isEndInWeek)   evCls += ' continues-right';

                html += `<div
                    class="${evCls}"
                    style="grid-column:${colStart + 1}/span ${span};grid-row:${slot + 1};"
                    onclick="showHistoryDetail(${historyData.indexOf(item)})"
                    title="${escapeHtml(item.name)} (${escapeHtml(item.dateRange || '')})">
                    <i class="fas ${getIconByCategory(item.category)}"></i>
                    <span>${escapeHtml(item.name)}</span>
                </div>`;
            });
            html += `</div>`;
        } else {
            html += `<div class="cal-events-empty"></div>`;
        }

        html += `</div>`; // cal-week-row
        cur.setDate(cur.getDate() + 7);
    }

    grid.innerHTML = html;
}

// ─ 이벤트 슬롯 배정 ────────────────────────────────────────

/**
 * 한 주(weekStart~weekEnd) 안에서 이벤트들이 겹치지 않도록 슬롯(행)을 배정한다.
 * @param {Array} weekEvents
 * @param {Date}  weekStart  해당 주 일요일
 * @param {Date}  weekEnd    해당 주 토요일
 * @returns {Array<{colStart, colEnd, slot, item}>}
 */
function _assignEventSlots(weekEvents, weekStart, weekEnd) {
    const result = [];
    const sorted = [...weekEvents].sort((a, b) => a.startDate - b.startDate);

    sorted.forEach(item => {
        // 주 안에서의 실제 표시 범위 계산
        const clampedStart = item.startDate < weekStart ? weekStart : item.startDate;
        const clampedEnd   = item.endDate   > weekEnd   ? weekEnd   : item.endDate;

        const colStart = clampedStart.getDay(); // 0(일)~6(토)
        const colEnd   = clampedEnd.getDay();

        // 겹치지 않는 가장 낮은 슬롯 찾기
        let slot = 0;
        while (result.some(r =>
            r.slot === slot &&
            r.colStart <= colEnd &&
            r.colEnd   >= colStart
        )) { slot++; }

        result.push({ colStart, colEnd, slot, item });
    });

    return result;
}

// ─ 헬퍼 ────────────────────────────────────────────────────

function _getCategoryColorClass(category) {
    if (!category) return 'cal-ev-default';
    const c = category.toLowerCase();
    if (c.includes('음향')) return 'cal-ev-sound';
    if (c.includes('영상')) return 'cal-ev-video';
    if (c.includes('사진')) return 'cal-ev-photo';
    return 'cal-ev-default';
}

// ─ 이벤트 상세 (기어 모달 재활용) ──────────────────────────

/**
 * 캘린더 이벤트 클릭 시 장비 상세 모달을 히스토리 정보로 채워서 표시
 * @param {number} index - historyData 배열 인덱스
 */
function showHistoryDetail(index) {
    const item = historyData[index];
    if (!item) return;

    document.getElementById('modalTitle').innerText    = item.name    || '-';
    document.getElementById('modalSubtitle').innerText = `${item.category || ''} · ${item.department || ''}`;

    document.getElementById('modalBody').innerHTML = `
        <div class="detail-grid">
            <div class="detail-item">
                <span class="dlabel">카테고리</span>
                <span class="dval">${escapeHtml(item.category || '-')}</span>
            </div>
            <div class="detail-item">
                <span class="dlabel">상태</span>
                <span class="dval">
                    <span class="status-tag ${getStatusClass(item.status)}">${escapeHtml(item.status || '-')}</span>
                </span>
            </div>
            <div class="detail-item fw">
                <span class="dlabel">사용 기간</span>
                <span class="dval">
                    <i class="fas fa-calendar-days" style="color:#cbd5e1;margin-right:6px;"></i>
                    ${escapeHtml(item.dateRange || '-')}
                </span>
            </div>
            <div class="detail-item fw">
                <span class="dlabel">보관 / 사용 장소</span>
                <span class="dval">
                    <i class="fas fa-location-dot" style="color:#cbd5e1;margin-right:6px;"></i>
                    ${escapeHtml(item.location || '-')}
                </span>
            </div>
            <div class="detail-item">
                <span class="dlabel">사용자</span>
                <span class="dval">${escapeHtml(item.user || '-')}</span>
            </div>
            <div class="detail-item">
                <span class="dlabel">사용 부서</span>
                <span class="dval">${escapeHtml(item.department || '-')}</span>
            </div>
            <div class="detail-item fw">
                <span class="dlabel">사용 목적</span>
                <span class="dval">${escapeHtml(item.purpose || '-')}</span>
            </div>
        </div>`;

    // 히스토리 상세에서는 삭제 버튼 숨김
    const dangerBtn = document.querySelector('#gearModal .danger-btn');
    if (dangerBtn) dangerBtn.style.display = 'none';

    // 수정 링크
    const editBtn = document.getElementById('modalEditBtn');
    if (item.editUrl && item.editUrl !== '-' && item.editUrl !== '') {
        editBtn.href         = item.editUrl;
        editBtn.style.display = 'inline-flex';
    } else {
        editBtn.style.display = 'none';
    }

    document.getElementById('gearModal').classList.add('active');
}
