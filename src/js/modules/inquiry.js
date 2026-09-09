// ═══ 문의하기 모듈 ═══
// 사용자가 남긴 문의를 Google Apps Script로 보내 Notes(메모)와 History 시트에
// 함께 기록한다. History 카테고리를 INQUIRY_CATEGORY로 고정해 두었기 때문에
// 문의 목록은 별도 시트 없이 History gviz 조회만으로 되읽을 수 있다.

const INQUIRY_CATEGORY  = '문의';   // History 카테고리(=문의 식별자)
const INQUIRY_STATUS    = '접수';   // History 상태 기본값
const INQUIRY_NO_GEAR   = '문의';   // 관련 장비가 없을 때 장비명 칸에 들어가는 값
const INQUIRY_MAX_LEN   = 500;
const INQUIRY_FEED_DAYS = 90;       // 최근 문의 조회 기간
const INQUIRY_FRESH_MS  = 60000;    // 섹션 재진입 시 재조회를 건너뛰는 시간

const INQUIRY_TYPES = [
    { id: '장비 고장', icon: 'fa-triangle-exclamation', tone: 'danger'  },
    { id: '대여 문의', icon: 'fa-hand-holding-heart',   tone: 'primary' },
    { id: '분실 신고', icon: 'fa-circle-question',      tone: 'warn'    },
    { id: '개선 요청', icon: 'fa-lightbulb',            tone: 'accent'  },
    { id: '기타',      icon: 'fa-comment',              tone: 'muted'   }
];

let inquiryType  = INQUIRY_TYPES[0].id;
let inquiryData  = [];   // 최근 문의 목록
let _inqLoadedAt = 0;    // 마지막 로드 시각(ms)

// ── 초기화 ────────────────────────────────────────────────────────────────────

/**
 * 문의 섹션 진입 시 초기화. 드롭다운을 채우고 최근 문의를 불러온다.
 */
function initInquirySection() {
    renderInquiryTypeChips();
    initInquiryDropdowns();
    bindInquiryCounter();
    if (typeof renderUserPicker === 'function') renderUserPicker('inquiryUserPicker');

    // 짧은 간격의 재진입이면 캐시된 목록을 그대로 보여준다(gviz 호출 절약).
    if (_inqLoadedAt && Date.now() - _inqLoadedAt < INQUIRY_FRESH_MS) renderInquiryList();
    else loadInquiries();
}

/** 문의 유형 칩을 그린다(선택 상태 반영). */
function renderInquiryTypeChips() {
    const wrap = document.getElementById('inqTypeChips');
    if (!wrap) return;

    wrap.innerHTML = INQUIRY_TYPES.map(t => `
        <button type="button" class="inq-chip inq-chip--${t.tone}${t.id === inquiryType ? ' on' : ''}"
                data-type="${escapeHtml(t.id)}" aria-pressed="${t.id === inquiryType}">
            <i class="fas ${t.icon}"></i><span>${escapeHtml(t.id)}</span>
        </button>`).join('');

    wrap.onclick = e => {
        const chip = e.target.closest('[data-type]');
        if (!chip) return;
        inquiryType = chip.dataset.type;
        renderInquiryTypeChips();
    };
}

/** 부서 · 관련 장비 select를 채운다(중복 호출 안전). */
function initInquiryDropdowns() {
    const dep = document.getElementById('inqDepartment');
    if (dep && dep.options.length === 0) {
        dep.innerHTML = '<option value="">-- 부서 선택 --</option>' +
            DEPARTMENTS.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
    }

    const gear = document.getElementById('inqGear');
    if (!gear) return;

    const keep  = gear.value;
    const items = (typeof inventoryData !== 'undefined' ? inventoryData : [])
        .slice()
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko'));

    gear.innerHTML = '<option value="">-- 특정 장비와 무관 --</option>' +
        items.map(i =>
            `<option value="${escapeHtml(String(i.id))}">${escapeHtml(i.name)}${i.category ? ' · ' + escapeHtml(i.category) : ''}</option>`
        ).join('');
    if (keep) gear.value = keep;
}

/** 글자수 카운터를 연결한다(oninput 대입이라 중복 호출에 안전). */
function bindInquiryCounter() {
    const ta  = document.getElementById('inqMessage');
    const out = document.getElementById('inqCount');
    if (!ta || !out) return;
    const sync = () => { out.textContent = String(ta.value.length); };
    ta.oninput = sync;
    sync();
}

// ── 전송 ──────────────────────────────────────────────────────────────────────

/**
 * 문의를 Apps Script로 전송한다. Notes(메모) + History 양쪽에 기록된다.
 */
async function submitInquiry() {
    const userEl = document.getElementById('inqUser');
    const msgEl  = document.getElementById('inqMessage');
    const depEl  = document.getElementById('inqDepartment');
    const gearEl = document.getElementById('inqGear');
    if (!userEl || !msgEl) return;

    const author  = userEl.value.trim();
    const message = msgEl.value.trim();

    if (!author) {
        showNotification('작성자를 선택해주세요.', 'error');
        if (typeof openUserPicker === 'function') openUserPicker('inquiryUserPicker');
        return;
    }
    if (!message) {
        showNotification('문의 내용을 입력해주세요.', 'error');
        msgEl.focus();
        return;
    }
    if (message.length > INQUIRY_MAX_LEN) {
        showNotification('문의 내용은 ' + INQUIRY_MAX_LEN + '자까지 입력할 수 있습니다.', 'error');
        return;
    }

    const gearId = gearEl ? gearEl.value.trim() : '';
    const gear   = gearId ? (inventoryData || []).find(i => String(i.id) === gearId) : null;

    const inquiry = {
        id:           Date.now(),
        type:         inquiryType,
        author:       author,
        department:   depEl ? depEl.value : '',
        message:      message,
        date:         new Date().toLocaleString('ko-KR'),
        gearId:       gear ? gear.id : '',
        gearName:     gear ? gear.name : '',
        gearCategory: gear ? gear.category : '',
        gearLocation: gear ? gear.location : ''
    };

    const btn  = document.getElementById('inqSubmitBtn');
    const html = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 보내는 중...';
        btn.disabled  = true;
    }

    try {
        const res = await fetch(GOOGLE_WEBAPP_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'text/plain' },
            body:    JSON.stringify({ action: 'addInquiry', inquiry })
        });
        if (!res.ok) throw new Error('서버 오류: ' + res.status);
        const result = await res.json();
        if (result && result.error) throw new Error(result.error);
    } catch (e) {
        console.error('Inquiry save failed:', e);
        showNotification('문의 전송 실패: ' + e.message, 'error');
        return;
    } finally {
        if (btn) { btn.innerHTML = html; btn.disabled = false; }
    }

    // 입력 초기화 (작성자는 연속 문의를 위해 유지)
    msgEl.value = '';
    if (gearEl) gearEl.value = '';
    bindInquiryCounter();

    // 시트 gviz 캐시가 갱신되기 전이라도 방금 보낸 문의가 바로 보이도록 앞에 끼운다.
    inquiryData = [toInquiryFeedItem(inquiry), ...inquiryData];
    renderInquiryList();

    showNotification('문의가 접수되었습니다. 담당자가 확인 후 처리합니다.', 'success');
}

/** 전송 직후의 문의 객체를 목록 렌더링 형식으로 변환한다. */
function toInquiryFeedItem(inquiry) {
    return {
        type:       inquiry.type,
        author:     inquiry.author,
        department: inquiry.department,
        message:    inquiry.message,
        gearName:   inquiry.gearName,
        status:     INQUIRY_STATUS,
        actionDate: new Date(),
        pending:    true
    };
}

// ── 목록 조회 ─────────────────────────────────────────────────────────────────

/**
 * History 시트에서 카테고리가 '문의'인 행을 최근순으로 읽어온다.
 * @param {boolean} isManual - 새로고침 버튼에서 호출된 경우 토스트로 결과를 알린다.
 */
async function loadInquiries(isManual = false) {
    const list = document.getElementById('inquiryList');
    if (!HISTORY_SHEET_URL) {
        if (list) list.innerHTML = inquiryEmptyHtml('History 시트 URL이 설정되지 않았습니다.', 'fa-link-slash');
        return;
    }
    if (list) list.innerHTML = '<div class="inq-feed-loading"><i class="fas fa-spinner fa-spin"></i> 문의를 불러오는 중...</div>';

    try {
        const since = new Date();
        since.setDate(since.getDate() - INQUIRY_FEED_DAYS);
        const fmt = d =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        // C열 = 카테고리, A열 = 사용일시 (History 시트 헤더 순서 고정)
        const tq = `SELECT * WHERE C = '${INQUIRY_CATEGORY}' AND A >= timestamp '${fmt(since)} 00:00:00' ORDER BY A DESC LIMIT 50`;

        const res = await fetch(`${HISTORY_SHEET_URL}&tq=${encodeURIComponent(tq)}`);
        if (!res.ok) throw new Error('네트워크 오류: ' + res.status);

        const rows = _parseGvizHistoryText(await res.text());
        if (rows === null) throw new Error('데이터 포맷 오류');

        inquiryData  = rows.map(historyRowToInquiry);
        _inqLoadedAt = Date.now();
        if (isManual) showNotification(`문의 ${inquiryData.length}건을 불러왔습니다.`, 'success');
    } catch (e) {
        console.error('loadInquiries 실패:', e);
        if (list) list.innerHTML = inquiryEmptyHtml('문의를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.', 'fa-triangle-exclamation');
        if (isManual) showNotification('문의를 불러오지 못했습니다.', 'error');
        return;
    }

    renderInquiryList();
}

/**
 * History 행을 문의 목록 항목으로 변환한다.
 * History에는 문의 전용 컬럼이 없으므로 유형은 '사용 목적' 앞에 '[유형] 내용'
 * 형태로 붙여 저장하고 여기서 다시 분리한다. (appsscript.gs의 addInquiryToSheet와 짝)
 */
function historyRowToInquiry(row) {
    const matched = (row.purpose || '').match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
    return {
        type:       matched ? matched[1] : '기타',
        author:     row.user || '익명',
        department: row.department || '',
        message:    matched ? matched[2] : (row.purpose || ''),
        gearName:   (row.name && row.name !== INQUIRY_NO_GEAR) ? row.name : '',
        status:     row.status || INQUIRY_STATUS,
        actionDate: row.actionDate,
        pending:    false
    };
}

// ── 렌더링 ────────────────────────────────────────────────────────────────────

function renderInquiryList() {
    const list = document.getElementById('inquiryList');
    if (!list) return;

    if (!inquiryData.length) {
        list.innerHTML = inquiryEmptyHtml('아직 접수된 문의가 없습니다.', 'fa-inbox');
        return;
    }

    list.innerHTML = inquiryData.map(inq => {
        const meta = INQUIRY_TYPES.find(t => t.id === inq.type)
                  || INQUIRY_TYPES[INQUIRY_TYPES.length - 1];
        const gearHtml = inq.gearName
            ? `<span class="inq-item-gear"><i class="fas fa-box"></i> ${escapeHtml(inq.gearName)}</span>`
            : '';
        const depHtml = inq.department
            ? `<span class="inq-item-dept">${escapeHtml(inq.department)}</span>`
            : '';

        return `
            <article class="inq-item${inq.pending ? ' pending' : ''}">
                <div class="inq-item-icon inq-chip--${meta.tone}"><i class="fas ${meta.icon}"></i></div>
                <div class="inq-item-body">
                    <div class="inq-item-top">
                        <span class="inq-item-type inq-chip--${meta.tone}">${escapeHtml(inq.type)}</span>
                        <span class="inq-item-time">${escapeHtml(formatInquiryTime(inq.actionDate))}</span>
                    </div>
                    <p class="inq-item-msg">${escapeHtml(inq.message)}</p>
                    <div class="inq-item-foot">
                        <span class="inq-item-author"><i class="fas fa-user"></i> ${escapeHtml(inq.author)}</span>
                        ${depHtml}${gearHtml}
                    </div>
                </div>
            </article>`;
    }).join('');
}

function inquiryEmptyHtml(text, icon) {
    return `<div class="empty-state"><i class="fas ${icon}"></i><h3>${escapeHtml(text)}</h3></div>`;
}

/** 상대 시간(방금 전 / N분 전 / N시간 전) → 하루가 넘어가면 날짜 표기. */
function formatInquiryTime(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
    if (diffMin < 1)    return '방금 전';
    if (diffMin < 60)   return `${diffMin}분 전`;
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}시간 전`;
    return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}
