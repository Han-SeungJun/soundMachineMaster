// ═══ 히스토리 캘린더 모듈 ═══

// ── 상태 ──────────────────────────────────────────────────────────────────────
let historyData      = [];
let calendarYear     = new Date().getFullYear();
let calendarMonth    = new Date().getMonth();
let calHistoryFilter = { category: 'all', department: 'all', search: '' };

// 3개월 윈도우 캐시 키 (year-month 형식)
let _histCacheKey = null;

// ── 초기화 ────────────────────────────────────────────────────────────────────

/**
 * 히스토리 섹션 진입 시 초기화 (캐시 무효화 → 데이터 로드 → 렌더링)
 */
async function initHistorySection() {
    // 섹션 재진입 시 항상 최신 데이터를 가져오도록 캐시 초기화
    _histCacheKey = null;
    historyData   = [];

    _initCalDepartmentFilter();
    _showCalLoading();

    if (!HISTORY_SHEET_URL) {
        const grid = document.getElementById('calendarGrid');
        if (grid) grid.innerHTML = `<div class="empty-state"><i class="fas fa-calendar-xmark"></i><h3>History 시트 URL 미설정</h3><p>config.js의 HISTORY_SHEET_URL을 확인하세요.</p></div>`;
        return;
    }

    await _fetchHistoryForMonth(calendarYear, calendarMonth);
    renderCalendar();
}

function _initCalDepartmentFilter() {
    const sel = document.getElementById('calDepartmentFilter');
    if (!sel || sel.options.length > 1) return;
    DEPARTMENTS.forEach(dep => {
        const o = document.createElement('option');
        o.value = dep; o.textContent = dep;
        sel.appendChild(o);
    });
}

function _showCalLoading() {
    const grid = document.getElementById('calendarGrid');
    if (grid) grid.innerHTML = `<div class="cal-loading"><i class="fas fa-spinner"></i>히스토리를 불러오는 중...</div>`;
}

/**
 * 히스토리 캐시를 초기화합니다. (새로고침 버튼 클릭 시 호출)
 */
function resetHistoryCache() {
    _histCacheKey = null;
    historyData   = [];
}

// ── 데이터 로드 ───────────────────────────────────────────────────────────────

/**
 * 현재 월의 ±1개월(3개월 윈도우) 데이터를 로드합니다.
 * 같은 월 재조회 시 캐시를 사용합니다.
 */
async function _fetchHistoryForMonth(year, month) {
    const cacheKey = `${year}-${month}`;
    if (_histCacheKey === cacheKey) return; // 캐시 히트

    try {
        // 이전달 1일 ~ 다음다음달 1일 (3개월 윈도우)
        const winStart = new Date(year, month - 1, 1);
        const winEnd   = new Date(year, month + 2, 1);

        const filteredUrl = _buildHistoryUrl(winStart, winEnd);
        const res         = await fetch(filteredUrl);
        if (!res.ok) throw new Error('네트워크 오류');

        const text   = await res.text();
        const parsed = _parseGvizHistoryText(text);

        if (parsed === null) {
            // gviz TQ 쿼리 실패 → 전체 데이터 폴백 (소규모 시트 허용)
            const fallbackRes  = await fetch(HISTORY_SHEET_URL);
            const fallbackText = await fallbackRes.text();
            historyData = _parseGvizHistoryText(fallbackText) || [];
        } else {
            historyData = parsed;
        }

        _histCacheKey = cacheKey;
    } catch(e) {
        console.error('History fetch failed:', e);
        showNotification('히스토리 데이터를 불러올 수 없습니다.', 'error');
        historyData = [];
    }
}

/**
 * 날짜 범위 기반 gviz URL 생성
 * 사용일시(열 A)가 Date 타입이면 timestamp 필터가 작동합니다.
 */
function _buildHistoryUrl(startDate, endDate) {
    const fmt = d =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const tq = `SELECT * WHERE A >= timestamp '${fmt(startDate)} 00:00:00' AND A < timestamp '${fmt(endDate)} 00:00:00' ORDER BY A DESC`;
    return `${HISTORY_SHEET_URL}&tq=${encodeURIComponent(tq)}`;
}

/**
 * gviz 응답 텍스트를 파싱합니다.
 * @returns {Array|null} 파싱된 배열, 오류/빈 응답 시 null
 */
function _parseGvizHistoryText(text) {
    const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S\w]+)\);?/);
    if (!match) return null;
    try {
        const json = JSON.parse(match[1]);
        if (json.status === 'error' || !json.table) return null;
        if (!json.table.rows || json.table.rows.length === 0) return [];
        const cols = json.table.cols.map(c => c ? c.label : '');
        return _parseHistoryRows(json.table.rows, cols);
    } catch(e) {
        return null;
    }
}

/**
 * gviz 행 배열을 히스토리 객체 배열로 변환합니다.
 * 사용일시(열 A)의 cell.v = "Date(year,month0,day,h,m,s)" 를 파싱해
 * actionDate(Date 객체)로 저장합니다. 캘린더 날짜 매칭에 사용됩니다.
 */
function _parseHistoryRows(rows, cols) {
    return rows.map(row => {
        const obj = {};
        if (!row || !row.c) return obj;
        row.c.forEach((cell, i) => {
            if (!cell) return;
            const val = (cell.f != null ? cell.f : cell.v);
            const str = (typeof val === 'string') ? val.trim() : String(val ?? '').trim();
            const h   = (cols[i] || '').trim().toLowerCase();

            if (h === '사용일시' || h === '타임스탬프') {
                obj.timestamp = str; // 화면 표시용 포맷 문자열
                // cell.v = "Date(2026,3,15,10,30,0)" (월은 0-based)
                const rawV = cell.v;
                if (typeof rawV === 'string' && rawV.startsWith('Date(')) {
                    const p = rawV.slice(5, -1).split(',').map(Number);
                    const d = new Date(p[0], p[1], p[2] || 1, p[3] || 0, p[4] || 0, p[5] || 0);
                    if (!isNaN(d.getTime())) obj.actionDate = d;
                }
            }
            else if (h === '장비명'   || h.includes('장비명'))   obj.name       = str;
            else if (h === '카테고리' || h.includes('카테고리'))  obj.category   = str;
            else if (h === '상태'     || h.includes('상태'))      obj.status     = str;
            else if (h === '위치'     || h.includes('위치'))      obj.location   = str;
            else if (h.includes('사용자'))                         obj.user       = str;
            else if (h.includes('목적'))                           obj.purpose    = str;
            else if (h.includes('부서'))                           obj.department = str;
            else if (h.includes('사용 날짜') || h === '사용날짜') obj.dateStr    = str;
            else if (h.includes('수정'))                           obj.editUrl    = str;
        });
        return obj;
    }).filter(item => item.name && item.actionDate);
}

/**
 * "YYYY.MM.DD ~ YYYY.MM.DD" 등 다양한 날짜 형식 파싱
 */
function _parseUsageDate(str) {
    if (!str || str === '-') return { start: null, end: null };

    // gviz Date() 포맷 처리
    if (str.startsWith('Date(')) {
        const p = str.slice(5, -1).split(',').map(Number);
        const d = new Date(p[0], p[1], p[2] || 1);
        return { start: isNaN(d) ? null : d, end: isNaN(d) ? null : d };
    }

    const parts    = str.split(/\s*[~–—]\s*/);
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

/**
 * 최근 7일간 히스토리를 가져옵니다. (헤더 모달용)
 * @returns {Promise<Array>}
 */
async function fetchWeeklyHistoryData() {
    if (!HISTORY_SHEET_URL) return [];
    try {
        const today        = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const fmt = d =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const tq  = `SELECT * WHERE A >= timestamp '${fmt(sevenDaysAgo)} 00:00:00' AND A <= timestamp '${fmt(today)} 23:59:59' ORDER BY A DESC`;
        const url = `${HISTORY_SHEET_URL}&tq=${encodeURIComponent(tq)}`;

        const res  = await fetch(url);
        if (!res.ok) throw new Error('네트워크 오류');
        const text = await res.text();

        const parsed = _parseGvizHistoryText(text);
        if (parsed !== null) return parsed;

        // 폴백: 전체 데이터 → 클라이언트 필터
        const fallbackRes  = await fetch(HISTORY_SHEET_URL);
        const fallbackText = await fallbackRes.text();
        const all = _parseGvizHistoryText(fallbackText) || [];
        return all.filter(item => {
            if (!item.timestamp) return false;
            // timestamp는 문자열이므로 단순 조회 (정확한 비교 불필요)
            return true;
        }).slice(0, 50); // 안전 상한
    } catch(e) {
        console.error('Weekly history fetch failed:', e);
        return [];
    }
}

// ── 필터 ──────────────────────────────────────────────────────────────────────

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

// ── 달력 네비게이션 ───────────────────────────────────────────────────────────

async function prevMonth() {
    calendarMonth--;
    if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
    _showCalLoading();
    await _fetchHistoryForMonth(calendarYear, calendarMonth);
    renderCalendar();
}

async function nextMonth() {
    calendarMonth++;
    if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
    _showCalLoading();
    await _fetchHistoryForMonth(calendarYear, calendarMonth);
    renderCalendar();
}

async function goToToday() {
    calendarYear  = new Date().getFullYear();
    calendarMonth = new Date().getMonth();
    _showCalLoading();
    await _fetchHistoryForMonth(calendarYear, calendarMonth);
    renderCalendar();
}

// ── 달력 렌더링 (점 방식) ─────────────────────────────────────────────────────

/**
 * 현재 calendarYear / calendarMonth 기준으로 달력을 점(dot) 방식으로 렌더링합니다.
 * 각 날짜 셀에 카테고리별 점을 표시하고, 클릭 시 상세 다이얼로그를 엽니다.
 */
function renderCalendar() {
    const titleEl = document.getElementById('calendarMonthTitle');
    if (titleEl) titleEl.textContent = `${calendarYear}년 ${calendarMonth + 1}월`;

    const grid = document.getElementById('calendarGrid');
    if (!grid) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const lastDay  = new Date(calendarYear, calendarMonth + 1, 0);

    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay());
    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

    const filteredData = _getFilteredHistory();
    let html = '';
    let cur  = new Date(startDate);

    while (cur <= endDate) {
        html += `<div class="cal-week-row"><div class="cal-days-num-row">`;

        for (let d = 0; d < 7; d++) {
            const day = new Date(cur);
            day.setDate(cur.getDate() + d);

            const isToday      = day.getTime() === today.getTime();
            const isOtherMonth = day.getMonth() !== calendarMonth;
            const isSunday     = d === 0;
            const isSaturday   = d === 6;

            // 이 날짜에 해당하는 이벤트 수집 (사용일시 기준 정확한 날짜 매칭)
            const dayEvents = filteredData.filter(item => {
                if (!item.actionDate) return false;
                return item.actionDate.getFullYear() === day.getFullYear() &&
                       item.actionDate.getMonth()    === day.getMonth()    &&
                       item.actionDate.getDate()     === day.getDate();
            });
            const hasEvents = dayEvents.length > 0;

            let cls = 'cal-day-num-cell';
            if (isToday)      cls += ' today';
            if (isOtherMonth) cls += ' other-month';
            if (isSunday)     cls += ' sunday';
            if (isSaturday)   cls += ' saturday';
            if (hasEvents)    cls += ' has-events';

            const dateStr  = _formatDateKey(day);
            const clickAttr = hasEvents
                ? `onclick="showDayDetail('${dateStr}')" title="${day.getMonth() + 1}월 ${day.getDate()}일 ${dayEvents.length}건 클릭하여 확인"`
                : '';

            html += `<div class="${cls}" ${clickAttr}>
                <span class="cal-day-num">${day.getDate()}</span>
                ${hasEvents ? _renderDots(dayEvents) : ''}
            </div>`;
        }

        html += `</div></div>`;
        cur.setDate(cur.getDate() + 7);
    }

    grid.innerHTML = html;
}

/**
 * Date → "YYYY-MM-DD" 형식 문자열
 */
function _formatDateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 날짜 셀의 점(dot) HTML 생성
 * 카테고리별 고유 색 점을 최대 5개까지 표시하고, 건수를 작은 숫자로 표시합니다.
 */
function _renderDots(events) {
    const uniqueCats = [...new Set(events.map(e => e.category).filter(Boolean))];
    const dots = uniqueCats.slice(0, 4).map(cat =>
        `<span class="cal-dot ${_getCategoryColorClass(cat)}"></span>`
    ).join('');
    const countBadge = events.length > 1
        ? `<span class="cal-dot-count">${events.length}</span>`
        : '';
    return `<div class="cal-day-dots">${dots}${countBadge}</div>`;
}

// ── 날짜 상세 다이얼로그 ──────────────────────────────────────────────────────

/**
 * 특정 날짜 클릭 시 해당 일의 사용 내역 다이얼로그를 표시합니다.
 * @param {string} dateStr "YYYY-MM-DD" 형식
 */
function showDayDetail(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);

    const filtered = _getFilteredHistory();
    const events   = filtered.filter(item => {
        if (!item.actionDate) return false;
        return item.actionDate.getFullYear() === y &&
               item.actionDate.getMonth()    === m - 1 &&
               item.actionDate.getDate()     === d;
    });

    if (events.length === 0) return;

    const modal   = document.getElementById('dayDetailModal');
    const titleEl = document.getElementById('dayDetailTitle');
    const listEl  = document.getElementById('dayDetailList');
    if (!modal || !titleEl || !listEl) return;

    titleEl.textContent = `${y}년 ${m}월 ${d}일 사용 내역`;

    // 부서별 정렬 후 렌더링
    const sorted = [...events].sort((a, b) =>
        (a.department || '').localeCompare(b.department || '', 'ko')
    );

    listEl.innerHTML = sorted.map(item => {
        const catCls = _getCategoryColorClass(item.category);
        return `<div class="day-detail-item">
            <div class="day-detail-cat-badge ${catCls}">
                <i class="fas ${getIconByCategory(item.category)}"></i>
                ${escapeHtml(item.category || '기타')}
            </div>
            <div class="day-detail-body">
                <div class="day-detail-dept">${escapeHtml(item.department || '-')}</div>
                <div class="day-detail-row">
                    <span class="day-detail-label">사용자</span>
                    <span>${escapeHtml(item.user || '-')}</span>
                </div>
                <div class="day-detail-row">
                    <span class="day-detail-label">장비</span>
                    <span>${escapeHtml(item.name || '-')}</span>
                </div>
                ${item.purpose ? `<div class="day-detail-purpose"><i class="fas fa-info-circle"></i> ${escapeHtml(item.purpose)}</div>` : ''}
                ${item.status ? `<div class="day-detail-row"><span class="day-detail-label">상태</span><span class="status-tag ${getStatusClass(item.status)}" style="font-size:10px;">${escapeHtml(item.status)}</span></div>` : ''}
            </div>
        </div>`;
    }).join('');

    modal.classList.add('active');
}

/**
 * 날짜 상세 다이얼로그 닫기
 */
function closeDayDetailModal() {
    const modal = document.getElementById('dayDetailModal');
    if (modal) modal.classList.remove('active');
}

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

function _getCategoryColorClass(category) {
    if (!category) return 'cal-ev-default';
    const c = category.toLowerCase();
    if (c.includes('음향')) return 'cal-ev-sound';
    if (c.includes('영상')) return 'cal-ev-video';
    if (c.includes('사진')) return 'cal-ev-photo';
    return 'cal-ev-default';
}
