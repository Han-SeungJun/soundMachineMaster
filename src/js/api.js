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
            document.getElementById('history-badge').innerText = data.length;

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
