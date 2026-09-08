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
window.HTMLCanvasElement.prototype.getContext = () => ({});

// index.html과 동일한 순서로 실제 앱 스크립트 주입
const files = ['src/js/config.js', 'src/js/state.js', 'src/js/utils.js', 'src/js/api.js',
    'src/js/modules/toast.js', 'src/js/modules/inventory.js', 'src/js/modules/dashboard.js',
    'src/js/modules/notes.js', 'src/js/modules/users.js', 'src/js/modules/modal.js',
    'src/js/modules/sets.js', 'src/js/modules/set-custom.js',
    'src/js/modules/stats.js', 'src/js/modules/sheet.js', 'src/js/modules/history-calendar.js',
    'src/js/modules/inquiry.js',
    'src/js/modules/navigation.js', 'src/js/app.js'];
// 브라우저의 <script> 태그처럼 하나의 전역 렉시컬 스코프에서 실행해야
// 파일 간 const 참조(DEPARTMENTS 등)가 실제와 동일하게 동작한다.
const NL = String.fromCharCode(10);
const bundle = files.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join(NL + ';' + NL)
    + NL + ';window.__consts = { DEPARTMENTS, LOCATIONS, USER_PICKER_SEARCH_MIN };'
    + NL + 'window.__set = function (k, v) { window.__tmp = v; eval(k + " = window.__tmp"); };'
    + NL + 'window.__get = function (k) { return eval(k); };';
try { window.eval(bundle); }
catch (e) { console.log('  LOAD ERROR: ' + e.message); fail++; }

// jsdom은 파싱 시점에 DOMContentLoaded를 이미 흘려보내므로, 번들을 eval한 뒤
// 직접 한 번 발생시켜야 app.js의 문서 레벨 리스너(바깥 클릭으로 선택기 닫기)가 붙는다.
// 이게 없으면 [1b]의 회귀 테스트가 아무것도 검증하지 못한다(변이 테스트로 확인).
dom.window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

const d = window.document;
const $ = s => d.querySelector(s);

console.log('\n[1] 사용자 선택기 — 목록 렌더링 & 탭 선택');
window.__set('usersData', [
    { userName: '김하은', department: '청년부 영상팀' },
    { userName: '한승준', department: '본팀 영상팀' },
    { userName: '홍길동', department: '' }
]);
window.refreshUserPickers();
// 대여 · 세트 대여 · 문의하기 — 세 화면이 같은 선택기를 공유한다.
ok('picker 3개 렌더됨', d.querySelectorAll('.user-picker-btn').length === 3,
    String(d.querySelectorAll('.user-picker-btn').length));
ok('초기 라벨은 "사용자 선택"', $('#rentUserPicker .user-picker-value').textContent.trim() === '사용자 선택');
ok('패널은 기본 닫힘', $('#rentUserPicker .user-picker-panel').hasAttribute('hidden'));

window.toggleUserPicker('rentUserPicker');
ok('탭하면 패널 열림', !$('#rentUserPicker .user-picker-panel').hasAttribute('hidden'));
const opts = [...d.querySelectorAll('#rentUserPicker .user-picker-opt')].map(b => b.dataset.user);
ok('사용자 3명 모두 노출 (타이핑 없이)', JSON.stringify(opts) === JSON.stringify(['김하은', '한승준', '홍길동']), JSON.stringify(opts));
ok('사용자 8명 미만이면 검색창 숨김', !$('#rentUserPicker .user-picker-search'));

console.log('');
console.log('[1b] 실제 클릭으로 열기 — 회귀 방지');
// 재렌더로 e.target이 DOM에서 떨어져 나가면 document의 "바깥 클릭" 판정이 참이 되어
// 방금 연 패널이 즉시 닫혔다(사용자 선택 자체가 불가능). 진짜 클릭 경로로 검증한다.
const clickIt = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
window.closeAllUserPickers();
clickIt($('#rentUserPicker .user-picker-btn'));
ok('버튼을 실제로 클릭하면 패널이 열린 채 유지', d.getElementById('rentUserPicker').classList.contains('open'));
ok('열린 패널에 사용자 옵션 노출', d.querySelectorAll('#rentUserPicker .user-picker-opt').length === 3,
    String(d.querySelectorAll('#rentUserPicker .user-picker-opt').length));
clickIt(d.querySelector('#rentUserPicker .user-picker-opt'));
ok('옵션을 실제로 클릭하면 값이 들어감', $('#rentUser').value === '김하은', $('#rentUser').value);
$('#rentUser').value = '';
window.refreshUserPickers();

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

console.log('');
console.log('[4b] "+ 추가하기" — 전역 사용자 추가');
window.__set('usersData', [{ userName: '김민지', department: '본팀 영상팀' }]);
window.localStorage.removeItem('soundreport.localUsers');
window.refreshUserPickers();
window.toggleUserPicker('rentUserPicker');
ok('패널 하단에 추가하기 버튼 노출', !!$('#rentUserPicker .user-picker-add'));
window.openUserAddForm('rentUserPicker');
ok('추가 폼 렌더', !!$('#rentUserPicker .upa-name') && !!$('#rentUserPicker .upa-dept'));
$('#rentUserPicker .upa-name').value = '한승준';
$('#rentUserPicker .upa-dept').value = '본팀 음향팀';
window.submitUserAddForm('rentUserPicker');   // GAS 호출은 offline이라 실패 → 로컬 폴백 경로
ok('추가 즉시 선택값에 반영', $('#rentUser').value === '한승준', $('#rentUser').value);
ok('추가한 사용자가 목록에 나타남', window.getUserOptions().some(u => u.userName === '한승준'));
ok('로컬 캐시에 저장(시트 저장 실패 대비)',
    JSON.parse(window.localStorage.getItem('soundreport.localUsers') || '[]').some(u => u.userName === '한승준'));
window.__set('usersData', [{ userName: '김민지', department: '본팀 영상팀' }]);
ok('시트를 다시 읽어도 로컬 추가분 유지', window.getUserOptions().some(u => u.userName === '한승준'));
window.localStorage.removeItem('soundreport.localUsers');

console.log('');
console.log('[4c] GAS addUser 액션');
const gasUser = fs.readFileSync(path.join(ROOT, 'appsscript.gs'), 'utf8');
ok('doPost에 addUser 라우팅', gasUser.includes("action === 'addUser'"));
ok('addUserToSheet 정의', gasUser.includes('function addUserToSheet'));
ok('같은 이름은 중복 추가하지 않음', gasUser.includes('already: true'));

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

console.log('');
console.log('[5d] 대시보드 세트 대여 카드');
window.__set('inventoryData', [
    { id: 1, name: 'C100', category: '영상', status: '가용', location: '방재실', date: '2026.09.01' },
    { id: 2, name: 'C100', category: '영상', status: '대여중', location: '방재실', date: '2026.09.01' },
    { id: 3, name: '17-55', category: '영상', status: '가용', location: '방재실', date: '2026.09.01' },
    { id: 4, name: 'C4', category: '음향', status: '가용', location: '3/4층 본당', date: '2026.09.01' }
]);
window.__set('setsData', [{ setId: 'SET1', setName: '영상팀 8번', team: '청년부 영상팀', isActive: true, sortOrder: 1, icon: 'fa-video', color: '' }]);
window.__set('setItemsData', [
    { setId: 'SET1', itemName: 'C100', category: '영상', quantity: 2, sortOrder: 1 },
    { setId: 'SET1', itemName: '17-55', category: '영상', quantity: 1, sortOrder: 2 }
]);
window.__set('rentBundlesData', [{ bundleId: 'B1', userName: '김하은', setName: '주일 세트',
    itemNames: 'C100|17-55', isFavorite: true, useCount: 4, lastUsedAt: 2, createdAt: 1 }]);
window.renderDashboardSets();
const dashHtml = $('#dashSetsArea').innerHTML;
ok('대시보드에 세트 타일 렌더', dashHtml.includes('영상팀 8번') && dashHtml.includes('dash-set-tile'));
ok('타일에 가용 수량 표시', dashHtml.includes('2/3'), dashHtml.includes('dst-avail') ? 'dst-avail 있음' : '없음');
ok('커스텀 대여 타일 항상 노출', dashHtml.includes('커스텀 대여') && dashHtml.includes('openCustomSetRent()'));
ok('다시 대여 칩 노출', dashHtml.includes('주일 세트') && dashHtml.includes('openBundleRent'));
ok('세트 타일이 해당 세트로 모달을 연다', dashHtml.includes("openSetRentModal('SET1')"));

console.log('');
console.log('[5e] 커스텀 구성 — 직접 담아 대여');
window.openSetRentModal();
ok('모달 기본은 커스텀 접힘', d.getElementById('setCustomArea').hidden === true);
window.setCustomMode(true);
ok('커스텀 열면 가용 장비만 노출',
    d.querySelectorAll('#setCustomList .set-custom-item').length === 3,
    String(d.querySelectorAll('#setCustomList .set-custom-item').length));
window.toggleCustomItem(1);
window.toggleCustomItem(4);
ok('담은 만큼 대여 버튼 활성화', $('#setRentConfirmBtn').disabled === false);
ok('담은 수량 표시', $('#setCustomCount').textContent === '2대 담김', $('#setCustomCount').textContent);
ok('선택 구성에 담은 장비 반영',
    window.__get('currentSetSelection').matchedIds.join() === '1,4',
    JSON.stringify(window.__get('currentSetSelection').matchedIds));
window.toggleCustomItem(1);
ok('다시 누르면 빠짐', window.__get('currentSetSelection').matchedIds.join() === '4',
    JSON.stringify(window.__get('currentSetSelection').matchedIds));
window.toggleCustomItem(4);
ok('모두 빼면 대여 버튼 비활성화', $('#setRentConfirmBtn').disabled === true);

console.log('');
console.log('[5f] 세트를 커스텀으로 이어받기');
window.selectSet('SET1');
ok('세트 선택 시 커스텀 접힘', d.getElementById('setCustomArea').hidden === true);
ok('구성 화면에 커스텀 전환 버튼', $('#setCompList').innerHTML.includes('customizeCurrentSet()'));
window.customizeCurrentSet();
ok('세트 매칭분이 커스텀 선택으로 이관',
    window.__get('currentSetSelection').custom === true &&
    window.__get('currentSetSelection').matchedIds.join() === '1,3',
    JSON.stringify(window.__get('currentSetSelection').matchedIds));
ok('커스텀 목록이 열림', d.getElementById('setCustomArea').hidden === false);
window.closeSetRentModal();
ok('모달 닫으면 커스텀 초기화', $('#setCustomCount').textContent === '0대 담김', $('#setCustomCount').textContent);


console.log('');
console.log('[5g] 인라인 핸들러 인자 이스케이프');
// HTML 엔티티로는 못 막는다 — 속성값은 JS로 넘어가기 전에 디코드되므로 &#39;가 다시
// 따옴표가 되어 onclick의 문자열이 끊긴다. 실제로 실행해서 검증한다.
ok('작은따옴표는 역슬래시로 이스케이프',
    window.escapeAttrArg("SET'X") === "SET\\'X", window.escapeAttrArg("SET'X"));
ok('큰따옴표/꺾쇠는 HTML 이스케이프', window.escapeAttrArg('a"<b') === 'a&quot;&lt;b', window.escapeAttrArg('a"<b'));
ok('숫자 ID도 문자열로 처리', window.escapeAttrArg(4520260831093000) === '4520260831093000');

window.__set('inventoryData', []);
window.__set('rentBundlesData', []);
window.__set('setsData', [{ setId: "SET'X", setName: '따옴표 세트', team: '본팀 영상팀',
    isActive: true, sortOrder: 1, icon: 'fa-video', color: 'red" onload="alert(1)' }]);
window.__set('setItemsData', []);
window.renderDashboardSets();
const tileEl   = $('#dashSetsArea .dash-set-tile');
const tileCall = tileEl.getAttribute('onclick');
let calledWith = null;
const realOpenSetRent = window.openSetRentModal;
window.openSetRentModal = id => { calledWith = id; };   // 실행 경로만 확인 (모달은 열지 않음)
let threw = null;
try { window.eval(tileCall); } catch (e) { threw = e.message; }
window.openSetRentModal = realOpenSetRent;
ok('따옴표가 든 SetID로도 핸들러가 깨지지 않음', threw === null, threw);
ok('디코드된 인자가 원래 SetID와 같음', calledWith === "SET'X", JSON.stringify(calledWith));
ok('시트 color 값이 속성을 탈출하지 못함',
    !tileEl.hasAttribute('onload') && !$('#dashSetsArea').innerHTML.includes('onload='),
    '속성 탈출 흔적 있음');

// 뒤 섹션이 쓰는 인벤토리 픽스처를 되돌린다 ([5g]에서 비웠음)
window.__set('inventoryData', [
    { id: 1, name: 'C100', category: '영상', status: '가용', location: '방재실', date: '2026.09.01' },
    { id: 2, name: 'C100', category: '영상', status: '대여중', location: '방재실', date: '2026.09.01' },
    { id: 3, name: '17-55', category: '영상', status: '가용', location: '방재실', date: '2026.09.01' },
    { id: 4, name: 'C4', category: '음향', status: '가용', location: '3/4층 본당', date: '2026.09.01' }
]);

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

console.log('\n[8] 모바일 상단 탭 네비게이션');
// 하단 고정 탭바는 모바일 브라우저 UI에 가려 잘 보이지 않았다.
// 상단 sticky 탭 스트립으로 옮겼는지 CSS/JS 양쪽에서 확인한다.
const mobileBlock = resp.slice(resp.indexOf('@media (max-width: 768px)'), resp.indexOf('@media (max-width: 375px)'));
const navMenuRule = (mobileBlock.match(/\.nav-menu\s*\{[^}]*\}/) || [''])[0];
const sidebarRule = (mobileBlock.match(/\.sidebar\s*\{[^}]*\}/) || [''])[0];
ok('탭 스트립이 더 이상 하단 고정이 아님', !/position:\s*fixed/.test(navMenuRule) && !/bottom:\s*0/.test(navMenuRule), navMenuRule);
ok('사이드바가 상단 sticky', /position:\s*sticky/.test(sidebarRule) && /top:\s*0/.test(sidebarRule));
ok('탭 스트립 가로 스크롤', /overflow-x:\s*auto/.test(navMenuRule));
ok('하단 탭바용 본문 여백 제거', !/padding-bottom:\s*72px/.test(mobileBlock));
ok('노치 대응 safe-area 패딩', /env\(safe-area-inset-top/.test(sidebarRule));
ok('탭 터치 타깃 38px 이상', /min-height:\s*(3[89]|[4-9]\d)px/.test((mobileBlock.match(/\.nav-item\s*\{[^}]*\}/) || [''])[0]));

const inqNav = window.findNavItem('inquiry');
ok('문의하기 탭 존재', !!inqNav && inqNav.textContent.includes('문의하기'));
ok('요소를 넘기지 않아도 탭을 id로 찾음', window.findNavItem('history') !== null);
window.showSection('inquiry');
ok('showSection(id)만으로 활성 탭 갱신', inqNav.classList.contains('active'));
ok('활성 탭은 하나뿐', d.querySelectorAll('.nav-item.active').length === 1,
    String(d.querySelectorAll('.nav-item.active').length));
ok('문의 섹션 표시', d.getElementById('inquiry-section').style.display === 'block');
window.showSection('dashboard');
ok('다른 탭으로 이동하면 문의 섹션 숨김', d.getElementById('inquiry-section').style.display === 'none');
// app.js가 인덱스로 참조하는 장비 목록 탭 위치가 유지되어야 한다.
ok('nav-item[1]은 여전히 장비 목록', d.querySelectorAll('.nav-item')[1].textContent.includes('장비 목록'));

console.log('\n[9] 문의하기 — 작성 폼');
window.renderInquiryTypeChips();
const chips = [...d.querySelectorAll('#inqTypeChips .inq-chip')].map(b => b.dataset.type);
ok('문의 유형 칩 렌더', chips.length === 5 && chips[0] === '장비 고장', JSON.stringify(chips));
ok('첫 유형이 기본 선택', $('#inqTypeChips .inq-chip.on').dataset.type === '장비 고장');
clickIt(d.querySelectorAll('#inqTypeChips .inq-chip')[3]);
ok('칩을 클릭하면 선택 이동', $('#inqTypeChips .inq-chip.on').dataset.type === '개선 요청',
    $('#inqTypeChips .inq-chip.on').dataset.type);
ok('선택 상태가 접근성 속성에도 반영', $('#inqTypeChips .inq-chip.on').getAttribute('aria-pressed') === 'true');

window.initInquiryDropdowns();
ok('부서 select 채움', $('#inqDepartment').options.length === window.__consts.DEPARTMENTS.length + 1,
    String($('#inqDepartment').options.length));
ok('관련 장비 select 채움 (미지정 옵션 포함)', $('#inqGear').options.length === 5,
    String($('#inqGear').options.length));
ok('장비 미지정이 기본값', $('#inqGear').value === '');

const inqSample = '2층 아주사성전 무선마이크 소리가 끊깁니다';
$('#inqMessage').value = inqSample;
window.bindInquiryCounter();
ok('글자수 카운터 동기화', $('#inqCount').textContent === String(inqSample.length),
    $('#inqCount').textContent);

console.log('');
console.log('[9b] 전송 검증 — 작성자/내용 필수');
let toastMsg = '';
const realToast = window.showNotification;
window.showNotification = m => { toastMsg = m; };
$('#inqUser').value = '';
window.submitInquiry();
ok('작성자 없으면 전송 차단', toastMsg.includes('작성자'), toastMsg);
ok('차단 시 사용자 선택기를 열어줌', d.getElementById('inquiryUserPicker').classList.contains('open'));
window.closeAllUserPickers();
$('#inqUser').value = '김하은';
$('#inqMessage').value = '   ';
toastMsg = '';
window.submitInquiry();
ok('내용 없으면 전송 차단', toastMsg.includes('문의 내용'), toastMsg);
window.showNotification = realToast;

console.log('');
console.log('[9c] History 행 <-> 문의 항목 변환');
// 유형은 '사용 목적' 앞에 '[유형] '으로 붙여 저장한다 (GAS addInquiryToSheet와 짝).
const parsedInq = window.historyRowToInquiry({
    name: '무선마이크 2번', category: '문의', status: '접수', location: '2층 아주사성전',
    user: '김하은', purpose: '[장비 고장] 소리가 끊깁니다', department: '본팀 음향팀',
    actionDate: new Date()
});
ok('유형 분리', parsedInq.type === '장비 고장', parsedInq.type);
ok('내용에서 유형 접두어 제거', parsedInq.message === '소리가 끊깁니다', parsedInq.message);
ok('관련 장비명 유지', parsedInq.gearName === '무선마이크 2번', parsedInq.gearName);

const generalInq = window.historyRowToInquiry({
    name: '문의', category: '문의', status: '접수', location: '',
    user: '한승준', purpose: '[개선 요청] 대여 알림이 있으면 좋겠어요', department: '',
    actionDate: new Date()
});
ok('장비 미지정 문의는 장비명 비움', generalInq.gearName === '', generalInq.gearName);
ok('접두어 없는 옛 행도 깨지지 않음',
    window.historyRowToInquiry({ name: '문의', purpose: '그냥 내용', actionDate: new Date() }).message === '그냥 내용');

window.__set('inquiryData', [parsedInq, generalInq]);
window.renderInquiryList();
const feedHtml = $('#inquiryList').innerHTML;
ok('문의 목록 렌더', d.querySelectorAll('#inquiryList .inq-item').length === 2,
    String(d.querySelectorAll('#inquiryList .inq-item').length));
ok('유형 배지 노출', feedHtml.includes('장비 고장') && feedHtml.includes('개선 요청'));
ok('작성자 노출', feedHtml.includes('김하은') && feedHtml.includes('한승준'));
ok('관련 장비만 장비 칩 표시', (feedHtml.match(/inq-item-gear/g) || []).length === 1);
window.__set('inquiryData', []);
window.renderInquiryList();
ok('문의가 없으면 빈 상태 안내', $('#inquiryList').innerHTML.includes('아직 접수된 문의가 없습니다'));

console.log('');
console.log('[9d] 문의 내용 이스케이프');
window.__set('inquiryData', [{
    type: '기타', author: '<img src=x onerror=alert(1)>', department: '', message: '<script>alert(1)<\/script>',
    gearName: '', status: '접수', actionDate: new Date(), pending: false
}]);
window.renderInquiryList();
ok('문의 내용/작성자가 마크업으로 실행되지 않음',
    !$('#inquiryList').querySelector('img') && !$('#inquiryList').querySelector('script'));
window.__set('inquiryData', []);

console.log('');
console.log('[9e] GAS addInquiry 액션');
const gasInq = fs.readFileSync(path.join(ROOT, 'appsscript.gs'), 'utf8');
const inqFn  = gasInq.slice(gasInq.indexOf('function addInquiryToSheet'), gasInq.indexOf('function authorizeDriveAccess'));
ok('doPost에 addInquiry 라우팅', gasInq.includes("action === 'addInquiry'"));
ok('addInquiryToSheet 정의', inqFn.length > 0);
ok('Notes(메모)에 기록', inqFn.includes('getNotesSheet()'));
ok('History에도 기록', inqFn.includes('writeHistoryRow('));
ok('참조ID를 노트 ID와 맞춰 삭제 연동', inqFn.includes('String(noteId)'));
ok('작성자/내용 누락은 서버에서도 거부',
    inqFn.includes("error: '작성자 누락'") && inqFn.includes("error: '문의 내용 누락'"));
ok('문의는 장비 상태를 바꾸지 않음', !inqFn.includes('syncStatusToMainSheet'));

console.log('');
console.log('[9f] 문의 화면 CSS');
const inqCss = fs.readFileSync(path.join(ROOT, 'src/css/inquiry.css'), 'utf8');
const inqMobile = inqCss.slice(inqCss.indexOf('@media (max-width: 768px)'));
ok('index.html이 inquiry.css를 로드',
    fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').includes('src/css/inquiry.css'));
ok('태블릿 이하 1열', /@media \(max-width: 1024px\)[\s\S]*grid-template-columns:\s*1fr/.test(inqCss));
ok('모바일 iOS 확대 방지 16px', /font-size:\s*16px/.test(inqMobile));
ok('모바일 전송 버튼 터치 타깃 48px 이상', /\.inq-submit-btn\s*\{[^}]*min-height:\s*5\dpx/.test(inqMobile));

console.log('\n' + '='.repeat(46) + '\n  PASS ' + pass + ' / FAIL ' + fail + '\n' + '='.repeat(46));
process.exit(fail ? 1 : 0);
