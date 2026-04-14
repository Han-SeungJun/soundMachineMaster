// ═══ 앱 진입점 — DOMContentLoaded 이후 초기화 ═══

document.addEventListener('DOMContentLoaded', () => {

    // ── 초기 렌더링 ────────────────────────────────────────
    initDropdowns();
    initDashboard();
    renderInventory();
    updateStats();

    // ── 검색창 Enter 키: 인벤토리 섹션으로 이동 ──────────────
    document.getElementById('gearSearch').addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            showSection('inventory', document.querySelectorAll('.nav-item')[1]);
            filterInventory();
        }
    });

    // ── 키보드 단축키 ─────────────────────────────────────
    document.addEventListener('keydown', e => {
        // '/' 키 → 검색창 포커스
        if (
            e.key === '/' &&
            document.activeElement.tagName !== 'INPUT' &&
            document.activeElement.tagName !== 'TEXTAREA'
        ) {
            e.preventDefault();
            document.getElementById('gearSearch').focus();
        }

        // Escape → 열린 모달 닫기
        if (e.key === 'Escape') {
            closeModal();
            closeFormModal();
            closeHistoryModal();
            closeSheetEditModal();
            closeDayDetailModal();
        }
    });

    // ── 외부 링크 (Google Form) 초기화 ────────────────────
    document.querySelectorAll('.link-gear-register, .link-gear-register-btn').forEach(el => {
        el.href   = GOOGLE_FORM_URL;
        el.target = '_blank';
    });

    // ── 데이터 로드 ───────────────────────────────────────
    setSyncStatus('syncing', '데이터 로딩 중...');
    if (GOOGLE_SHEET_API && GOOGLE_SHEET_API.trim() !== '') {
        fetchDataFromGS();
    }
});
