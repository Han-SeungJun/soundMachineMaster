// ═══ 네비게이션 모듈 ═══

/**
 * 콘텐츠 섹션 전환 및 네비게이션 활성 상태 업데이트
 * @param {'dashboard'|'inventory'|'inquiry'|'stats'|'sheet'|'history'} id - 표시할 섹션 ID
 * @param {Element|null} el - 클릭된 nav-item 요소 (활성화 처리). 생략 시 id로 찾는다.
 */
function showSection(id, el) {
    // 모든 섹션 숨김
    document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');

    // 대상 섹션 표시
    const sec = document.getElementById(`${id}-section`);
    if (sec) sec.style.display = 'block';

    // 네비게이션 활성 상태 업데이트
    // 호출자가 요소를 넘기지 않아도(캐린더·검색 등 프로그램 전환) 탭이
    // 상태를 잃지 않도록 id로 다시 찾는다.
    const navEl = el || findNavItem(id);
    if (navEl) {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        navEl.classList.add('active');
        scrollNavItemIntoView(navEl);
    }

    // 섹션별 초기화
    if      (id === 'inventory') renderInventory();
    else if (id === 'inquiry')   initInquirySection();
    else if (id === 'stats')     initStats();
    else if (id === 'sheet')     initSheetSection();
    else if (id === 'history')   initHistorySection();
    else                         initDashboard();
}

/**
 * 섹션 id에 대응하는 nav-item을 onclick 속성에서 찾는다.
 * @param {string} id
 * @returns {Element|null}
 */
function findNavItem(id) {
    return Array.from(document.querySelectorAll('.nav-item')).find(a =>
        (a.getAttribute('onclick') || '').includes(`showSection('${id}'`)
    ) || null;
}

/**
 * 모바일 상단 탭 스트립은 가로 스크롤되므로, 선택된 탭이 화면 밖에
 * 있으면 보이지 않는다. 활성 탭을 스트립 안으로 끌어다 놓는다.
 * (데스크톱 사이드바는 세로 배치라 스크롤 폭이 없으므로 자연히 no-op이 된다.)
 * @param {Element} navEl
 */
function scrollNavItemIntoView(navEl) {
    const strip = navEl.closest('.nav-menu');
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;

    const left = navEl.offsetLeft - (strip.clientWidth - navEl.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
}
