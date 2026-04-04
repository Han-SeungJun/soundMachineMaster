// ═══ 토스트 알림 모듈 ═══

/**
 * 화면 우하단 토스트 메시지 표시
 * @param {string} msg
 * @param {'success'|'error'|'info'} type
 */
function showNotification(msg, type = 'info') {
    const toast = document.getElementById('toast');
    const icon  = toast.querySelector('i');

    document.getElementById('toastMsg').innerText = msg;
    toast.className = `toast ${type}`;
    icon.className  = `fas ${
        type === 'success' ? 'fa-circle-check' :
        type === 'error'   ? 'fa-circle-xmark' :
                             'fa-circle-info'
    }`;

    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3200);
}
