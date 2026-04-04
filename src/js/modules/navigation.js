// ═══ 네비게이션 모듈 ═══

/**
 * 콘텐츠 섹션 전환 및 사이드바 활성 상태 업데이트
 * @param {'dashboard'|'inventory'|'stats'|'sheet'|'history'} id - 표시할 섹션 ID
 * @param {Element|null} el - 클릭된 nav-item 요소 (활성화 처리)
 */
function showSection(id, el) {
    // 모든 섹션 숨김
    document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');

    // 대상 섹션 표시
    const sec = document.getElementById(`${id}-section`);
    if (sec) sec.style.display = 'block';

    // 사이드바 활성 상태 업데이트
    if (el) {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        el.classList.add('active');
    }

    // 섹션별 초기화
    if      (id === 'inventory') renderInventory();
    else if (id === 'stats')     initStats();
    else if (id === 'sheet')     initSheetSection();
    else if (id === 'history')   initHistorySection();
    else                         initDashboard();
}
