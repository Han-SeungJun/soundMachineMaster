// ═══ 앱 설정 상수 ═══

const GOOGLE_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSeAbW1PX3Cg9oNc3kn0p0HLTkfDDg0C1QEGHOqxbQ25Zo69Rw/viewform?usp=sharing&ouid=106361419293264327468";
const GOOGLE_SHEET_API = "https://docs.google.com/spreadsheets/d/1AWw7zH5PAGLLMgpQ5WfSN4-R7Cr2E2VeFxstQoxAU1k/gviz/tq?tqx=out:json&gid=432772852";
const GOOGLE_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbzFn_aWZmXa9Yjtx4YxXTteFtkgMndXE087en-cTfWE8CSDPPPQ0nyeLQnuATJIEA43aQ/exec";

// 시트 읽기용 gviz/tq URL (CORS 없음, 인벤토리와 동일 방식)
const _SID = (GOOGLE_SHEET_API.match(/spreadsheets\/d\/([^\/]+)/) || [])[1] || '';
const NOTES_SHEET_URL = _SID
    ? `https://docs.google.com/spreadsheets/d/${_SID}/gviz/tq?tqx=out:json&sheet=Notes`
    : '';
const HISTORY_SHEET_URL = _SID
    ? `https://docs.google.com/spreadsheets/d/${_SID}/gviz/tq?tqx=out:json&sheet=History`
    : '';

const LOCATIONS = [
    "B1층 리바이벌 성전", "1층 유치부실", "1층 다윗의 장막",
    "1층 새가족1실", "1층 새가족2실", "2층 웨일즈성전", "2층 아주사성전",
    "2층 유아예배실", "2층 영아예배실", "3/4층 본당", "6층 존웨슬리홀", "방재실"
];

const DEPARTMENTS = [
    "방재실", "유치부 영상음향팀", "유초등부 영상음향팀", "중고등부 영상음향팀",
    "청년부 영상팀", "청년부 음향팀", "사사모 영상팀", "사사모 음향팀",
    "본팀 영상팀", "본팀 음향팀"
];

// 관리자 비밀번호 해시 (SHA-256)
const SHEET_ADMIN_HASH = 'daa35e4f1a0e43def76e13a948cbda05be2569901fa0c6d5d6342fb2bdc85028';
