// 스모크 테스트
// 빌드 파이프라인이 없는 정적 페이지라, index.html과 src/js/*를 브라우저와 동일한
// 단일 전역 스코프에서 jsdom으로 실행해 회귀를 잡는다.
//
//   npm install && npm test
//
// 주의: 각 스크립트를 개별 eval로 넣으면 파일 간 const 참조(DEPARTMENTS 등)가
// 깨진다. 실제 <script> 태그처럼 하나로 합쳐 실행해야 한다.

const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
    if (c) { pass++; console.log('  PASS ' + n); }
    else   { fail++; console.log('  FAIL ' + n + (extra ? ' -> ' + extra : '')); }
};

const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), {
    runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true
});
const { window } = dom;
window.fetch = () => Promise.reject(new Error('offline'));
window.Chart = function () { return { destroy() {} }; };
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });

// index.html과 동일한 순서로 실제 앱 스크립트 주입
const files = ['src/js/config.js', 'src/js/state.js', 'src/js/utils.js', 'src/js/api.js',
    'src/js/modules/toast.js', 'src/js/modules/inventory.js', 'src/js/modules/dashboard.js',
    'src/js/modules/notes.js', 'src/js/modules/modal.js', 'src/js/modules/sets.js',
    'src/js/modules/stats.js', 'src/js/modules/sheet.js', 'src/js/modules/history-calendar.js',
    'src/js/modules/navigation.js', 'src/js/app.js'];
// 브라우저의 <script> 태그처럼 하나의 전역 렉시컬 스코프에서 실행해야
// 파일 간 const 참조(DEPARTMENTS 등)가 실제와 동일하게 동작한다.
const NL = String.fromCharCode(10);
const bundle = files.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join(NL + ';' + NL)
    + NL + ';window.__consts = { DEPARTMENTS, LOCATIONS, USER_PICKER_SEARCH_MIN };'
    + NL + 'window.__set = function (k, v) { window.__tmp = v; eval(k + " = window.__tmp"); };';
try { window.eval(bundle); }
catch (e) { console.log('  LOAD ERROR: ' + e.message); fail++; }

const d = window.document;
const $ = s => d.querySelector(s);

console.log('\n[1] 사용자 선택기 — 목록 렌더링 & 탭 선택');
window.__set('usersData', [
    { userName: '김하은', department: '청년부 영상팀' },
    { userName: '한승준', department: '본팀 영상팀' },
    { userName: '홍길동', department: '' }
]);
window.refreshUserPickers();
ok('picker 2개 렌더됨', d.querySelectorAll('.user-picker-btn').length === 2,
    String(d.querySelectorAll('.user-picker-btn').length));
ok('초기 라벨은 "사용자 선택"', $('#rentUserPicker .user-picker-value').textContent.trim() === '사용자 선택');
ok('패널은 기본 닫힘', $('#rentUserPicker .user-picker-panel').hasAttribute('hidden'));

window.toggleUserPicker('rentUserPicker');
ok('탭하면 패널 열림', !$('#rentUserPicker .user-picker-panel').hasAttribute('hidden'));
const opts = [...d.querySelectorAll('#rentUserPicker .user-picker-opt')].map(b => b.dataset.user);
ok('사용자 3명 모두 노출 (타이핑 없이)', JSON.stringify(opts) === JSON.stringify(['김하은', '한승준', '홍길동']), JSON.stringify(opts));
ok('사용자 8명 미만이면 검색창 숨김', !$('#rentUserPicker .user-picker-search'));

console.log('\n[2] 선택 -> hidden input + 부서 자동완성');
const rentDept = $('#rentDepartment');
rentDept.innerHTML = '<option value=""></option>' + window.__consts.DEPARTMENTS.map(x => '<option value="' + x + '">' + x + '</option>').join('');
window.pickUser('rentUserPicker', '김하은');
ok('hidden #rentUser에 값 저장 (기존 대여 로직 무변경)', $('#rentUser').value === '김하은', $('#rentUser').value);
ok('버튼 라벨이 선택값으로 변경', $('#rentUserPicker .user-picker-value').textContent.trim() === '김하은');
ok('선택 후 패널 자동 닫힘', $('#rentUserPicker .user-picker-panel').hasAttribute('hidden'));
ok('부서 자동완성 동작', rentDept.value === '청년부 영상팀', rentDept.value);

console.log('\n[3] 검색 + 직접 입력 폴백');
const p = d.getElementById('rentUserPicker');
p.classList.add('open'); p.dataset.query = '하은'; window.renderUserPicker('rentUserPicker');
ok('검색어로 필터링', [...d.querySelectorAll('#rentUserPicker .user-picker-opt')].map(b => b.dataset.user).join() === '김하은');
p.dataset.query = '박새로이'; window.renderUserPicker('rentUserPicker');
ok('목록에 없으면 직접 입력 버튼 노출', !!$('#rentUserPicker .user-picker-manual'));
window.pickUser('rentUserPicker', $('#rentUserPicker .user-picker-manual').dataset.user);
ok('직접 입력값 반영', $('#rentUser').value === '박새로이', $('#rentUser').value);

console.log('\n[4] Users 시트 비었을 때 안내 & 전체 닫기');
window.__set('usersData', []);
window.refreshUserPickers();
window.toggleUserPicker('setRentUserPicker');
ok('빈 목록이면 안내문 노출', !!$('#setRentUserPicker .user-picker-empty'));
window.closeAllUserPickers();
ok('closeAllUserPickers 동작', d.querySelectorAll('.user-picker.open').length === 0);

console.log('\n[5] 세트 매칭 로직 (가용 유닛만, 중복 배정 없음)');
window.__set('inventoryData', [
    { id: 1, name: 'C100', category: '영상', status: '가용' },
    { id: 2, name: 'C100', category: '영상', status: '대여중' },
    { id: 3, name: '17-55', category: '영상', status: '가용' },
    { id: 4, name: 'C4', category: '음향', status: '가용' }
]);
window.__set('setsData', [{ setId: 'SET1', setName: '영상팀 8번', team: '청년부 영상팀', isActive: true, sortOrder: 1, icon: 'fa-video', color: '' }]);
window.__set('setItemsData', [
    { setId: 'SET1', itemName: 'C100', category: '영상', quantity: 2, sortOrder: 1 },
    { setId: 'SET1', itemName: '17-55', category: '영상', quantity: 1, sortOrder: 2 },
    { setId: 'SET1', itemName: 'C4', category: '음향', quantity: 1, sortOrder: 3 }
]);
const r = window.resolveSetUnits('SET1');
ok('가용 유닛만 매칭 (대여중 제외)', JSON.stringify(r.matchedIds) === JSON.stringify([1, 3, 4]), JSON.stringify(r.matchedIds));
ok('부족분 정확히 집계', r.shortages.length === 1 && r.shortages[0].itemName === 'C100' && r.shortages[0].have === 1,
    JSON.stringify(r.shortages));
window.renderSetList();
ok('세트 카드 렌더 + 가용 배지', $('#setListArea').innerHTML.includes('가용 3/4'));
window.selectSet('SET1');
ok('세트 선택 시 대여 버튼 활성화', $('#setRentConfirmBtn').disabled === false);
ok('구성 장비 부족 경고 표시', $('#setCompList').innerHTML.includes('부족'));

console.log('');
console.log('[5b] 미등록 장비명 구분 (시트 오타 드러내기)');
window.__set('setItemsData', [
    { setId: 'SET1', itemName: 'C100', category: '영상', quantity: 1, sortOrder: 1 },
    { setId: 'SET1', itemName: 'C1OO', category: '영상', quantity: 1, sortOrder: 2 },
    { setId: 'SET1', itemName: 'C4', category: '음향', quantity: 2, sortOrder: 3 }
]);
const r2 = window.resolveSetUnits('SET1');
const byName = Object.fromEntries(r2.detail.map(x => [x.itemName, x]));
ok('재고에 없는 이름은 missing=true', byName['C1OO'].missing === true);
ok('재고에 있으나 수량 부족은 missing=false', byName['C4'].missing === false && byName['C4'].have === 1,
    JSON.stringify(byName['C4']));
ok('가용 충분한 항목은 missing=false', byName['C100'].missing === false && byName['C100'].have === 1);
window.selectSet('SET1');
const compHtml = $('#setCompList').innerHTML;
ok('미등록 배지 렌더', compHtml.includes('미등록') && compHtml.includes('set-comp-badge missing'));
ok('부족 배지도 함께 렌더', compHtml.includes('set-comp-badge short'));
ok('경고문에 미등록 장비명 노출', compHtml.includes('C1OO') && compHtml.includes('세트 구성의 장비명이 재고와 다릅니다'));
const setsCss = fs.readFileSync(path.join(ROOT, 'src/css/sets.css'), 'utf8');
ok('미등록 배지 스타일 정의됨', setsCss.includes('.set-comp-badge.missing'));

console.log('');
console.log('[5c] GAS: 부분 실패 · UseCount 누적');
const gas = fs.readFileSync(path.join(ROOT, 'appsscript.gs'), 'utf8');
ok('묶음 기록에 성공분 장비명만 사용', gas.includes('recordRentBundle_(common, bundle, succeededNames.join('));
ok('클라이언트 itemNames를 그대로 쓰지 않음', !gas.includes('recordRentBundle_(common, bundle);'));
ok('실패 장비명을 응답에 포함', gas.includes('failedNames: failedNames'));
ok('묶음 동일성 판정 함수 존재', gas.includes('function bundleSignature_'));
ok('동일 구성 재대여 시 UseCount 증가', gas.includes('prev) + 1'));
ok('IsFavorite는 갱신 대상에서 제외', gas.includes("['Purpose', 'Department', 'UsageDate']"));
const sheetJs = fs.readFileSync(path.join(ROOT, 'src/js/modules/sheet.js'), 'utf8');
ok('세트 저장 시 미등록 장비명 확인', sheetJs.includes('재고에 없는 장비명이 있습니다'));
const setsJs = fs.readFileSync(path.join(ROOT, 'src/js/modules/sets.js'), 'utf8');
ok('실패 장비명을 토스트에 표시', setsJs.includes("failedNames.join(', ')"));

console.log('\n[6] 모바일 장비목록 — 카테고리 칩이 장비명 앞');
window.renderInventory();
const cell = $('.list-table tbody .name-cell-text');
ok('name-cell-text 래퍼 존재', !!cell);
ok('카테고리 칩이 장비명보다 앞', !!cell && cell.firstElementChild.classList.contains('row-cat-chip'));
ok('칩 내용이 카테고리', !!cell && cell.querySelector('.row-cat-chip').textContent === '영상');

console.log('\n[7] CSS 규칙 검증');
const resp = fs.readFileSync(path.join(ROOT, 'src/css/responsive.css'), 'utf8');
const comp = fs.readFileSync(path.join(ROOT, 'src/css/components.css'), 'utf8');
ok('모바일 툴바 카테고리 우선', /#categoryFilter\s*\{\s*order:\s*-1/.test(resp));
ok('모바일에서 카테고리(2)열 숨김', /\.list-table td:nth-child\(2\)/.test(resp));
ok('모바일에서 부서(5)열 숨김', /\.list-table td:nth-child\(5\)/.test(resp));
ok('데스크톱에선 칩 숨김', /\.row-cat-chip\s*\{\s*display:\s*none;\s*\}/.test(comp));
ok('모바일에서 칩 노출', /\.row-cat-chip\s*\{[^}]*display:\s*inline-block/.test(resp));
ok('미정의 CSS 변수 없음', !/var\(--border\)|var\(--bg-input/.test(comp));
ok('iOS 확대 방지 16px 검색창', /\.user-picker-search\s*\{[^}]*font-size:\s*16px/.test(resp));

console.log('\n' + '='.repeat(46) + '\n  PASS ' + pass + ' / FAIL ' + fail + '\n' + '='.repeat(46));
process.exit(fail ? 1 : 0);
