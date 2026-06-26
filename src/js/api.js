// ═══ Google Sheets API 통신 ═══

/**
 * 동기화 상태 UI 업데이트
 * @param {'syncing'|'synced'|'error'} state
 * @param {string} text
 */
function setSyncStatus(state, text) {
    const dot  = document.getElementById('syncDot');
    const span = document.getElementById('syncText');
    dot.className  = `sync-dot ${state}`;
    span.innerText = text;
}

/**
 * 새로고침 버튼 핸들러
 */
function refreshData() {
    const btn = document.getElementById('refreshBtn');
    btn.classList.add('spinning');
    setSyncStatus('syncing', '동기화 중...');
    if (typeof resetHistoryCache === 'function') resetHistoryCache();
    fetchDataFromGS().finally(() => {
        btn.classList.remove('spinning');
    });
}

/**
 * Google Sheets gviz/tq 엔드포인트에서 인벤토리 데이터 로드
 * 데이터 파싱 후 inventoryData(state)를 갱신하고 UI를 리렌더링한다.
 */
async function fetchDataFromGS() {
    try {
        const res = await fetch(GOOGLE_SHEET_API);
        if (!res.ok) throw new Error('네트워크 오류');

        const text  = await res.text();
        const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S\w]+)\);?/);
        if (!match) throw new Error('데이터 포맷 오류');

        const json = JSON.parse(match[1]);
        const cols = json.table.cols.map(c => c ? c.label : '');
        const rows = json.table.rows;

        const data = rows.map((row, idx) => {
            let obj = { id: null, icon: 'fa-box', editUrl: '-' };

            row.c.forEach((cell, i) => {
                if (!cell) return;
                let val = cell.v;
                if (typeof val === 'string') val = val.trim();
                const h = (cols[i] || '').toLowerCase();

                if      (h.includes('장비명'))   obj.name = val;
                else if (h.includes('카테고리')) { obj.category = val; obj.icon = getIconByCategory(val); }
                else if (h.includes('상태'))     obj.status = val;
                else if (h.includes('위치'))     obj.location = val;
                else if (h.includes('사용자 (실 사용자 혹은 담당교역자)')) obj.user = val;
                else if (h.includes('목적'))     obj.purpose = val;
                else if (h.includes('부서'))     obj.department = val;
                else if (h === '타임스탬프') {
                    // 폼 제출 타임스탬프 → 16자리 고유 ID
                    // gviz 날짜 형식: "Date(YYYY, M-1, D, H, m, s)"
                    if (cell.v && typeof cell.v === 'string' && cell.v.startsWith('Date(')) {
                        const p = cell.v.slice(5, -1).split(',').map(Number);
                        const tsStr =
                            String(p[0]) +
                            String(p[1] + 1).padStart(2, '0') +
                            String(p[2]).padStart(2, '0') +
                            String(p[3] || 0).padStart(2, '0') +
                            String(p[4] || 0).padStart(2, '0') +
                            String(p[5] || 0).padStart(2, '0');
                        const digitSum = tsStr.split('').reduce((a, c) => a + Number(c), 0);
                        const prefix = String(digitSum % 100).padStart(2, '0');
                        obj.id = parseInt(prefix + tsStr); // 16자리 ID
                    }
                    obj.date = cell.f || val;
                    if (obj.date && typeof obj.date === 'string') {
                        const dm = obj.date.match(/^(20\d{2}[\.\-\/] ?\d{1,2}[\.\-\/] ?\d{1,2})/);
                        if (dm) obj.date = dm[1];
                    }
                }
                else if (h === '수정 링크' || h.includes('edit url')) obj.editUrl = val;
            });

            if (!obj.id)         obj.id         = idx + 1; // 타임스탬프 없을 때 fallback
            if (!obj.name)       obj.name       = '-';
            if (!obj.category)   obj.category   = '기타';
            if (!obj.status)     obj.status     = '-';
            if (!obj.location)   obj.location   = '-';
            if (!obj.user)       obj.user       = '-';
            if (!obj.purpose)    obj.purpose    = '-';
            if (!obj.department) obj.department = '-';
            if (!obj.date)       obj.date       = '-';
            return obj;
        }).filter(item => item.name !== '-' && item.name !== '');

        if (data.length > 0) {
            inventoryData = data;
            renderInventory();
            updateStats();
            initDashboard();
            const now = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
            setSyncStatus('synced', `${now} 동기화 완료`);
            showNotification(`데이터 동기화 완료 (${data.length}건)`, 'success');
        } else {
            setSyncStatus('error', '데이터 없음');
        }
    } catch (e) {
        console.error('Sync failed:', e);
        setSyncStatus('error', '동기화 실패');
        showNotification('데이터를 불러올 수 없습니다.', 'error');
    }
}

// ═══ 공용 gviz 읽기 헬퍼 (세트/사용자/묶음 시트 공용) ═══

/**
 * gviz/tq 엔드포인트에서 JSON을 읽어 {cols, rows}로 파싱합니다.
 * (fetchDataFromGS와 동일한 파싱 규칙 — DRY를 위해 신규 로더가 공용으로 사용)
 * @param {string} url
 * @returns {Promise<{cols:string[], rows:Array}>}
 */
async function fetchGviz(url) {
    if (!url) throw new Error('시트 URL이 비어 있습니다.');
    const res = await fetch(url);
    if (!res.ok) throw new Error('네트워크 오류: ' + res.status);

    const text  = await res.text();
    const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S\w]+)\);?/);
    if (!match) throw new Error('데이터 포맷 오류');

    const json = JSON.parse(match[1]);
    const cols = (json.table.cols || []).map(c => (c && c.label) ? c.label.trim() : '');
    const rows = json.table.rows || [];
    return { cols, rows };
}

/**
 * fetchGviz 결과를 헤더명 기준 객체 배열로 변환합니다.
 * 각 행은 { [헤더명]: 셀값 } 형태(문자열은 trim). 빈 헤더 컬럼은 무시.
 * @param {{cols:string[], rows:Array}} parsed
 * @returns {Array<Object>}
 */
function gvizRowsToObjects(parsed) {
    const cols = parsed.cols || [];
    const rows = parsed.rows || [];
    return rows.map(row => {
        const obj = {};
        (row.c || []).forEach((cell, i) => {
            const key = cols[i];
            if (!key) return;
            let val = cell ? cell.v : null;
            if (typeof val === 'string') val = val.trim();
            obj[key] = val;
        });
        return obj;
    });
}
