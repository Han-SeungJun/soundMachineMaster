// ═══ 전역 앱 상태 ═══

let inventoryData = [];

let currentSelectedId = null;
let currentView = 'list';       // 'grid' | 'list'
let currentStatusPill = 'all';  // 'all' | 상태명 문자열 | 상태명 배열

let localPhotoDataUrls = [];    // 사진 첨부 미리보기용 임시 배열
let pendingNotes = {};          // { [itemId]: [note, ...] } — 저장 후 gviz 캐시 반영 전 임시 보관
let deletedNoteIds = new Set(); // 삭제 후 gviz 캐시 반영 전 임시 보관

// Chart.js 인스턴스 (재생성 시 destroy 필요)
let categoryChartInstance   = null;
let departmentChartInstance = null;
let statusChartInstance     = null;
let deptPolarChartInstance  = null;
let locationBarChartInstance = null;

// 시트 관리자 상태
let sheetAdminUnlocked = false;
let sheetEditItemId    = null;

// ── 세트 대여 상태 ──
let setsData         = [];   // Sets 마스터 [{setId, setName, team, ...}]
let setItemsData     = [];   // SetItems 구성 [{setId, itemName, category, quantity, ...}]
let usersData        = [];   // Users [{userName, department, role, ...}]
let rentBundlesData  = [];   // RentBundles [{bundleId, userName, itemNames, isFavorite, lastUsedAt, ...}]
let currentSetSelection = null; // 선택된 세트 매칭 결과 {setId, matchedIds, shortages}
let setEditId        = null; // 세트 관리 수정 중인 setId
