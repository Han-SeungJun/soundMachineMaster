/**
 * SoundMaster Apps Script Backend
 *
 * [초기 설정]
 * 1. authorizeDriveAccess 함수를 1회 실행하여 Drive 권한 승인
 * 2. 배포 > 새 배포 > 웹 앱 > 모든 사용자(익명) 접근
 * 3. populateEditLinks 함수를 1회 실행 후 트리거 추가:
 *    트리거 > 추가 > populateEditLinks / 스프레드시트에서 / 양식 제출 시
 */

const SPREADSHEET_ID = '1AWw7zH5PAGLLMgpQ5WfSN4-R7Cr2E2VeFxstQoxAU1k';

// ─── 수정 링크 생성 ───────────────────────────────────────────────────────────

/**
 * 폼 응답과 시트 행을 타임스탬프 기준으로 매핑하여 수정 링크를 K열에 기록합니다.
 * (배열 순서 매핑 방식은 삭제/편집 시 순서가 틀어지므로 타임스탬프 방식 사용)
 */
function populateEditLinks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  const formUrl = ss.getFormUrl();
  if (!formUrl) { Logger.log('연결된 설문지가 없습니다.'); return; }

  const form = FormApp.openByUrl(formUrl);
  const responses = form.getResponses();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;

  const linkColIdx = 9; // J열 (0-based) — 실제 시트의 수정 링크 위치
  if (data[0][linkColIdx] !== '수정 링크') {
    sheet.getRange(1, linkColIdx + 1).setValue('수정 링크');
  }

  // 폼 응답을 타임스탬프(ms) → 수정URL 맵으로 구성
  const responseMap = {};
  responses.forEach(function(r) {
    responseMap[r.getTimestamp().getTime()] = r.getEditResponseUrl();
  });

  // 각 시트 행의 타임스탬프(A열)와 폼 응답을 매칭 (1초 오차 허용)
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    const cellTs = new Date(data[i][0]).getTime();

    let editUrl = null;
    for (const ts in responseMap) {
      if (Math.abs(Number(ts) - cellTs) < 1000) {
        editUrl = responseMap[ts];
        break;
      }
    }

    if (editUrl && data[i][linkColIdx] !== editUrl) {
      sheet.getRange(i + 1, linkColIdx + 1).setValue(editUrl);
    }
  }
  Logger.log('수정 링크 갱신 완료');
}

// ─── 공통 헬퍼 ──────────────────────────────────────────────────────────────

/**
 * itemId로 메인 시트의 행 번호(1-based)를 찾습니다.
 * - itemId > 20000000000 → 14자리 YYYYMMDDHHMMSS 타임스탬프 기반 검색 (신버전)
 * - itemId <= 20000000000 → 행 인덱스 기반 (구버전 호환)
 */
function findSheetRowByItemId(sheet, itemId) {
  const parsedId = Number(itemId);
  const data = sheet.getDataRange().getValues();

  if (parsedId > 20000000000) {
    // 마지막 14자리 = YYYYMMDDHHMMSS (앞 2자리는 난수 접두사, slice(-14)로 제거)
    const tsStr = String(parsedId).slice(-14);
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      const d = new Date(data[i][0]);
      const cellId =
        String(d.getFullYear()) +
        String(d.getMonth() + 1).padStart(2, '0') +
        String(d.getDate()).padStart(2, '0') +
        String(d.getHours()).padStart(2, '0') +
        String(d.getMinutes()).padStart(2, '0') +
        String(d.getSeconds()).padStart(2, '0');
      if (cellId === tsStr) return i + 1;
    }
    return -1;
  } else {
    const row = parsedId + 1;
    return (row >= 2 && row <= sheet.getLastRow()) ? row : -1;
  }
}

// ─── HTTP 엔드포인트 ─────────────────────────────────────────────────────────

function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'getNotes') {
      const includePhotos = e.parameter.includePhotos === 'true';
      const notes = getNotesFromSheet(e.parameter.itemId, includePhotos);
      return ContentService.createTextOutput(JSON.stringify(notes))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    const action = params.action;

    if (action === 'addNote') {
      return ContentService.createTextOutput(JSON.stringify(addNoteToSheet(params.note)))
        .setMimeType(ContentService.MimeType.JSON);
    } else if (action === 'deleteNote') {
      return ContentService.createTextOutput(JSON.stringify(deleteNoteFromSheet(params.itemId, params.noteId)))
        .setMimeType(ContentService.MimeType.JSON);
    } else if (action === 'deleteItem') {
      return ContentService.createTextOutput(JSON.stringify(deleteItemFromSheet(params.itemId)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ error: 'Unknown action' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── Notes 시트 ─────────────────────────────────────────────────────────────

// Notes 시트: GearID | NoteID | Status | Memo | Date  (Photos 컬럼 없음)
function getNotesSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('Notes');
  if (!sheet) {
    sheet = ss.insertSheet('Notes');
    sheet.appendRow(['GearID', 'NoteID', 'Status', 'Memo', 'Date']);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#f3f3f3');
  }
  return sheet;
}

// PhotosData 시트: NoteID | PhotoIndex | Filename | Base64Data
function getPhotosDataSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('PhotosData');
  if (!sheet) {
    sheet = ss.insertSheet('PhotosData');
    sheet.appendRow(['NoteID', 'PhotoIndex', 'Filename', 'Base64Data']);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#f3f3f3');
  }
  return sheet;
}

/**
 * includePhotos=false(기본): PhotosData 미조회 → 대시보드/배너용 빠른 조회
 * includePhotos=true: PhotosData 포함 → 상세 모달 사진 표시용
 */
function getNotesFromSheet(itemId, includePhotos) {
  const notesSheet = getNotesSheet();
  const notesData = notesSheet.getDataRange().getValues();

  var photosMap = {};
  if (includePhotos) {
    const photosSheet = getPhotosDataSheet();
    const photosData = photosSheet.getDataRange().getValues();
    for (let i = 1; i < photosData.length; i++) {
      const nid = String(photosData[i][0]);
      if (!photosMap[nid]) photosMap[nid] = [];
      photosMap[nid].push({
        index: Number(photosData[i][1]),
        name: photosData[i][2] || '',
        data: photosData[i][3] || ''
      });
    }
    Object.values(photosMap).forEach(function(arr) {
      arr.sort(function(a, b) { return a.index - b.index; });
    });
  }

  const notes = [];
  for (let i = 1; i < notesData.length; i++) {
    if (String(notesData[i][0]) === String(itemId)) {
      const nid = String(notesData[i][1]);
      notes.push({
        itemId: notesData[i][0],
        id: notesData[i][1],
        status: notesData[i][2],
        memo: notesData[i][3],
        photos: includePhotos
          ? (photosMap[nid] || []).map(function(p) { return { data: p.data, name: p.name }; })
          : [],
        date: notesData[i][4]
      });
    }
  }
  return notes;
}

function addNoteToSheet(note) {
  const notesSheet = getNotesSheet();
  const photosSheet = getPhotosDataSheet();

  if (note.photos && note.photos.length > 0) {
    note.photos.forEach(function(photo, idx) {
      if (photo && photo.data) {
        photosSheet.appendRow([
          note.id,
          idx,
          photo.name || ('photo_' + idx + '.jpg'),
          photo.data
        ]);
      }
    });
  }

  notesSheet.appendRow([
    note.itemId,
    note.id,
    note.status || '',
    note.memo || '',
    note.date
  ]);

  // 상태 변경 시 메인 시트 "상태" 컬럼도 동기화 (삭제 시에는 호출 안 함)
  if (note.status) {
    syncStatusToMainSheet(note.itemId, note.status);
  }

  return { success: true, photoErrors: [] };
}

function deleteNoteFromSheet(itemId, noteId) {
  const notesSheet = getNotesSheet();
  const notesData = notesSheet.getDataRange().getValues();
  for (let i = notesData.length - 1; i >= 1; i--) {
    if (String(notesData[i][0]) === String(itemId) && String(notesData[i][1]) === String(noteId)) {
      notesSheet.deleteRow(i + 1);
    }
  }

  const photosSheet = getPhotosDataSheet();
  const photosData = photosSheet.getDataRange().getValues();
  for (let j = photosData.length - 1; j >= 1; j--) {
    if (String(photosData[j][0]) === String(noteId)) {
      photosSheet.deleteRow(j + 1);
    }
  }

  return { success: true };
}

// ─── 메인 시트 조작 ──────────────────────────────────────────────────────────

/**
 * 메인 시트의 "상태" 컬럼을 업데이트합니다.
 * addNote 시에만 호출 (deleteNote 시에는 호출하지 않아 메인 시트 값 유지).
 */
function syncStatusToMainSheet(itemId, newStatus) {
  if (!newStatus) return;
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const mainSheet = ss.getSheets()[0];
    const headers = mainSheet.getRange(1, 1, 1, mainSheet.getLastColumn()).getValues()[0];

    let statusCol = -1;
    for (let i = 0; i < headers.length; i++) {
      if (headers[i] && String(headers[i]).includes('상태')) { statusCol = i + 1; break; }
    }
    if (statusCol === -1) { Logger.log('"상태" 컬럼 없음'); return; }

    const targetRow = findSheetRowByItemId(mainSheet, itemId);
    if (targetRow === -1) { Logger.log('행 없음: itemId=' + itemId); return; }

    mainSheet.getRange(targetRow, statusCol).setValue(newStatus);
    Logger.log('상태 동기화: 행 ' + targetRow + ' → ' + newStatus);
  } catch (err) {
    Logger.log('syncStatusToMainSheet 오류: ' + err.toString());
  }
}

/**
 * 메인 시트에서 장비 행을 삭제하고, 연관된 Notes/PhotosData도 cascade 삭제합니다.
 */
function deleteItemFromSheet(itemId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const mainSheet = ss.getSheets()[0];
    const targetRow = findSheetRowByItemId(mainSheet, itemId);
    if (targetRow === -1) return { success: false, error: '해당 장비 행을 찾을 수 없습니다.' };
    mainSheet.deleteRow(targetRow);

    // Notes 및 PhotosData cascade 삭제
    const deletedCount = cascadeDeleteNotes(String(itemId));
    Logger.log('장비 삭제 완료: 행 ' + targetRow + ', itemId=' + itemId + ', 노트 ' + deletedCount + '건 삭제');
    return { success: true };
  } catch (err) {
    Logger.log('deleteItemFromSheet 오류: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

/**
 * 특정 장비의 모든 Notes와 PhotosData를 삭제합니다.
 * @returns {number} 삭제된 노트 수
 */
function cascadeDeleteNotes(itemId) {
  const notesSheet = getNotesSheet();
  const notesData = notesSheet.getDataRange().getValues();
  const deletedNoteIds = [];

  // Notes에서 해당 장비의 모든 노트 수집 후 역순으로 삭제 (인덱스 밀림 방지)
  for (let i = notesData.length - 1; i >= 1; i--) {
    if (String(notesData[i][0]) === itemId) {
      deletedNoteIds.push(String(notesData[i][1]));
      notesSheet.deleteRow(i + 1);
    }
  }

  // PhotosData에서 해당 노트들의 사진 삭제
  if (deletedNoteIds.length > 0) {
    const photosSheet = getPhotosDataSheet();
    const photosData = photosSheet.getDataRange().getValues();
    for (let j = photosData.length - 1; j >= 1; j--) {
      if (deletedNoteIds.includes(String(photosData[j][0]))) {
        photosSheet.deleteRow(j + 1);
      }
    }
  }

  return deletedNoteIds.length;
}

// ─── 권한 승인 (최초 1회 실행) ───────────────────────────────────────────────

/**
 * [1회 실행 필요] DriveApp 권한 승인용 함수
 * Apps Script 편집기에서 이 함수를 선택하고 ▶ 실행하세요.
 */
function authorizeDriveAccess() {
  const folder = DriveApp.getFolderById('1Cf-zzI7mW39rLaw-B3jvx5fN99Ajv0Ur');
  Logger.log('폴더 확인: ' + folder.getName());
  const testFile = folder.createFile('_auth_test_삭제해도됩니다.txt', 'auth', MimeType.PLAIN_TEXT);
  testFile.setTrashed(true);
  Logger.log('Drive 쓰기 권한 확인 완료!');
}
