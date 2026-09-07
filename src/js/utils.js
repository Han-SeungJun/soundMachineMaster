// ═══ 유틸리티 함수 (순수 함수) ═══

/**
 * 상태값 → CSS 클래스명 변환
 * @param {string} status
 * @returns {string}
 */
function getStatusClass(status) {
    switch (status) {
        case '가용':   return 'available';
        case '대여중': return 'in-use';
        case '수리중': return 'repair';
        case '문제발견': return 'issue';
        case '분실':   return 'lost';
        default:       return '';
    }
}

/**
 * 아이콘 클래스명 → 배경 테마 CSS 클래스 변환
 * @param {string} icon  (예: 'fa-volume-high')
 * @returns {string}
 */
function getBgClass(icon) {
    if (!icon) return 'default-bg';
    if (icon.includes('volume') || icon.includes('speaker')) return 'speaker-bg';
    if (icon.includes('microphone') || icon.includes('mic'))  return 'mic-bg';
    if (icon.includes('sliders') || icon.includes('mixer'))   return 'mixer-bg';
    if (icon.includes('link') || icon.includes('cable'))      return 'cable-bg';
    if (icon.includes('camera') || icon.includes('photo'))    return 'camera-bg';
    if (icon.includes('video') || icon.includes('film'))      return 'video-bg';
    return 'default-bg';
}

/**
 * 카테고리명 → FontAwesome 아이콘 클래스 변환
 * @param {string} category
 * @returns {string}
 */
function getIconByCategory(category) {
    if (!category) return 'fa-box';
    const c = category.toLowerCase();
    if (
        c.includes('음향') || c.includes('스피커') || c.includes('speaker') ||
        c.includes('마이크') || c.includes('mic') || c.includes('믹서') ||
        c.includes('mixer') || c.includes('케이블') || c.includes('cable')
    ) return 'fa-volume-high';
    if (c.includes('사진') || c.includes('photo') || c.includes('camera')) return 'fa-camera';
    if (c.includes('영상') || c.includes('video') || c.includes('film'))   return 'fa-video';
    return 'fa-box';
}

/**
 * HTML 특수문자 이스케이프
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * 인라인 핸들러의 문자열 인자용 이스케이프 (onclick="fn('...')").
 *
 * HTML 엔티티(&#39;)로는 막을 수 없다 — 속성값은 JS로 넘어가기 전에 디코드되므로
 * 엔티티가 다시 따옴표가 되어 문자열이 끊긴다. 그래서 JS 문자열용으로 먼저
 * 역슬래시 이스케이프한 뒤, 속성용으로 HTML 이스케이프한다(순서가 중요).
 * escapeHtml은 작은따옴표·역슬래시를 건드리지 않아 이 조합이 안전하다.
 *
 * @param {string|number} str
 * @returns {string}
 */
function escapeAttrArg(str) {
    const BS = String.fromCharCode(92);
    return escapeHtml(String(str == null ? '' : str)
        .split(BS).join(BS + BS)
        .split("'").join(BS + "'"));
}

/**
 * 평문 비밀번호 → SHA-256 해시 (hex)
 * @param {string} pw
 * @returns {Promise<string>}
 */
async function hashPassword(pw) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
