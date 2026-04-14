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
 * 신규 행(수정링크 미설정)인 경우에만 History에도 자동 기록합니다.
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

  const linkColIdx = 9; // J열 (0-based)
  if (data[0][linkColIdx] !== '수정 링크') {
    sheet.getRange(1, linkColIdx + 1).setValue('수정 링크');
  }

  // 폼 응답을 타임스탬프(ms) → 수정URL 맵으로 구성
  const responseMap = {};
  responses.forEach(function(r) {
    responseMap[r.getTimestamp().getTime()] = r.getEditResponseUrl();
  });

  // 헤더 기반 컬럼 인덱스 맵
  const headers = data[0];
  const colIdx = {};
  headers.forEach(function(h, i) { if (h) colIdx[String(h).trim()] = i; });

  const getField = function(row, label) {
    for (var h in colIdx) {
      if (h === label || h.includes(label)) return String(row[colIdx[h]] || '').trim();
    }
    return '';
  };

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

    if (editUrl) {
      const isNewRow = !data[i][linkColIdx]; // 수정링크 없는 신규 행
      if (data[i][linkColIdx] !== editUrl) {
        sheet.getRange(i + 1, linkColIdx + 1).setValue(editUrl);
      }
      // 신규 등록 행일 때만 History 기록
      if (isNewRow) {
        writeHistoryRow(
          getField(data[i], '장비명'),
          getField(data[i], '카테고리'),
          getField(data[i], '상태'),
          getField(data[i], '위치'),
          getField(data[i], '사용자'),
          getField(data[i], '사용 목적'),
          getField(data[i], '사용 부서'),
          getField(data[i], '사용 날짜'),
          editUrl
        );
      }
    }
  }
  Logger.log('수정 링크 갱신 완료');
}

// ─── History 시트 ────────────────────────────────────────────────────────────

/**
 * History 시트를 가져오거나 없으면 새로 만듭니다.
 */
function getHistorySheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('History');
  if (!sheet) {
    sheet = ss.insertSheet('History');
    sheet.appendRow([
      '사용일시', '장비명', '카테고리', '상태', '위치',
      '사용자 (실 사용자 혹은 담당교역자)', '사용 목적',
      '사용 부서', '사용 날짜', '수정 링크'
    ]);
    sheet.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#f3f3f3');
    // 사용일시 열 날짜 형식 지정
    sheet.getRange('A:A').setNumberFormat('yyyy. M. d. HH:mm:ss');
  }
  return sheet;
}

/**
 * History 시트에 이력 행을 추가합니다.
 */
function writeHistoryRow(name, category, status, location, user, purpose, department, usageDate, editUrl) {
  try {
    const sheet = getHistorySheet();
    sheet.appendRow([
      new Date(),
      name       || '',
      category   || '',
      status     || '',
      location   || '',
      user       || '',
      purpose    || '',
      department || '',
      usageDate  || '',
      editUrl    || ''
    ]);
  } catch(err) {
    Logger.log('writeHistoryRow 오류: ' + err.toString());
  }
}

/**
 * 메인 시트에서 장비 데이터를 읽어 반환합니다 (History 기록용 헬퍼).
 * @param {string|number} itemId
 * @returns {Object|null}
 */
function getItemDataFromMainSheet(itemId) {
  try {
    const ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
    const mainSheet = ss.getSheets()[0];
    const targetRow = findSheetRowByItemId(mainSheet, itemId);
    if (targetRow === -1) return null;

    const lastCol  = mainSheet.getLastColumn();
    const headers  = mainSheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const rowData  = mainSheet.getRange(targetRow, 1, 1, lastCol).getValues()[0];

    const ci = {};
    headers.forEach(function(h, i) { if (h) ci[String(h).trim()] = i; });

    const g = function(label) {
      for (var h in ci) {
        if (h === label || h.includes(label)) return String(rowData[ci[h]] || '').trim();
      }
      return '';
    };

    return {
      name:       g('장비명'),
      category:   g('카테고리'),
      status:     g('상태'),
      location:   g('위치'),
      user:       g('사용자'),
      purpose:    g('사용 목적'),
      department: g('사용 부서'),
      usageDate:  g('사용 날짜'),
      editUrl:    g('수정 링크')
    };
  } catch(e) {
    Logger.log('getItemDataFromMainSheet 오류: ' + e.toString());
    return null;
  }
}

// ─── 공통 헬퍼 ──────────────────────────────────────────────────────────────

/**
 * itemId로 메인 시트의 행 번호(1-based)를 찾습니다.
 */
function findSheetRowByItemId(sheet, itemId) {
  const parsedId = Number(itemId);
  const data = sheet.getDataRange().getValues();

  if (parsedId > 20000000000) {
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
    } else if (action === 'updateItem') {
      return ContentService.createTextOutput(JSON.stringify(updateItemInSheet(params.itemId, params.fields)))
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

function getNotesFromSheet(itemId, includePhotos) {
  const notesSheet = getNotesSheet();
  const notesData  = notesSheet.getDataRange().getValues();

  var photosMap = {};
  if (includePhotos) {
    const photosSheet = getPhotosDataSheet();
    const photosData  = photosSheet.getDataRange().getValues();
    for (let i = 1; i < photosData.length; i++) {
      const nid = String(photosData[i][0]);
      if (!photosMap[nid]) photosMap[nid] = [];
      photosMap[nid].push({ index: Number(photosData[i][1]), name: photosData[i][2] || '', data: photosData[i][3] || '' });
    }
    Object.values(photosMap).forEach(function(arr) { arr.sort(function(a, b) { return a.index - b.index; }); });
  }

  const notes = [];
  for (let i = 1; i < notesData.length; i++) {
    if (String(notesData[i][0]) === String(itemId)) {
      const nid = String(notesData[i][1]);
      notes.push({
        itemId: notesData[i][0], id: notesData[i][1],
        status: notesData[i][2], memo: notesData[i][3],
        photos: includePhotos
          ? (photosMap[nid] || []).map(function(p) { return { data: p.data, name: p.name }; })
          : [],
        date: notesData[i][4]
      });
    }
  }
  return notes;
}

/**
 * 노트/상태 변경을 저장하고, 상태가 변경된 경우 History에 자동 기록합니다.
 */
function addNoteToSheet(note) {
  const notesSheet  = getNotesSheet();
  const photosSheet = getPhotosDataSheet();

  if (note.photos && note.photos.length > 0) {
    note.photos.forEach(function(photo, idx) {
      if (photo && photo.data) {
        photosSheet.appendRow([note.id, idx, photo.name || ('photo_' + idx + '.jpg'), photo.data]);
      }
    });
  }

  notesSheet.appendRow([note.itemId, note.id, note.status || '', note.memo || '', note.date]);

  if (note.status) {
    syncStatusToMainSheet(note.itemId, note.status);

    // 상태 변경 시 History 자동 기록
    try {
      const item = getItemDataFromMainSheet(note.itemId);
      if (item) {
        writeHistoryRow(
          item.name, item.category, note.status, item.location,
          item.user, note.memo || item.purpose,
          item.department, item.usageDate, item.editUrl
        );
      }
    } catch(e) {
      Logger.log('History 기록 오류 (addNote): ' + e.toString());
    }
  }

  return { success: true, photoErrors: [] };
}

function deleteNoteFromSheet(itemId, noteId) {
  const notesSheet = getNotesSheet();
  const notesData  = notesSheet.getDataRange().getValues();
  for (let i = notesData.length - 1; i >= 1; i--) {
    if (String(notesData[i][0]) === String(itemId) && String(notesData[i][1]) === String(noteId)) {
      notesSheet.deleteRow(i + 1);
    }
  }
  const photosSheet = getPhotosDataSheet();
  const photosData  = photosSheet.getDataRange().getValues();
  for (let j = photosData.length - 1; j >= 1; j--) {
    if (String(photosData[j][0]) === String(noteId)) {
      photosSheet.deleteRow(j + 1);
    }
  }
  return { success: true };
}

// ─── 메인 시트 조작 ──────────────────────────────────────────────────────────

function syncStatusToMainSheet(itemId, newStatus) {
  if (!newStatus) return;
  try {
    const ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
    const mainSheet = ss.getSheets()[0];
    const headers   = mainSheet.getRange(1, 1, 1, mainSheet.getLastColumn()).getValues()[0];

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
 * 메인 시트의 장비 행 필드를 업데이트하고 History에 자동 기록합니다.
 */
function updateItemInSheet(itemId, fields) {
  try {
    const ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
    const mainSheet = ss.getSheets()[0];
    const lastCol   = mainSheet.getLastColumn();
    const headers   = mainSheet.getRange(1, 1, 1, lastCol).getValues()[0];

    const targetRow = findSheetRowByItemId(mainSheet, itemId);
    if (targetRow === -1) return { success: false, error: '해당 장비 행을 찾을 수 없습니다.' };

    const colMap = {};
    headers.forEach(function(h, i) { if (h) colMap[String(h).trim()] = i + 1; });

    const fieldMap = {
      name:       '장비명',
      category:   '카테고리',
      status:     '상태',
      location:   '위치',
      user:       '사용자 (실 사용자 혹은 담당교역자)',
      purpose:    '사용 목적',
      department: '사용 부서'
    };

    Object.keys(fields).forEach(function(key) {
      var headerName = fieldMap[key];
      if (!headerName) return;
      var col = colMap[headerName];
      if (!col) {
        for (var h in colMap) {
          if (h.includes(key === 'user' ? '사용자' : headerName)) { col = colMap[h]; break; }
        }
      }
      if (col) mainSheet.getRange(targetRow, col).setValue(fields[key] || '');
    });

    // 수정 후 최신 행 데이터로 History 기록
    try {
      const updatedRow = mainSheet.getRange(targetRow, 1, 1, lastCol).getValues()[0];
      const ci = {};
      headers.forEach(function(h, i) { if (h) ci[String(h).trim()] = i; });
      const g = function(label) {
        for (var h in ci) {
          if (h === label || h.includes(label)) return String(updatedRow[ci[h]] || '').trim();
        }
        return '';
      };
      writeHistoryRow(
        g('장비명'), g('카테고리'), g('상태'), g('위치'),
        g('사용자'), g('사용 목적'), g('사용 부서'), g('사용 날짜'), g('수정 링크')
      );
    } catch(e) {
      Logger.log('History 기록 오류 (updateItem): ' + e.toString());
    }

    Logger.log('장비 수정 완료: 행 ' + targetRow + ', itemId=' + itemId);
    return { success: true };
  } catch (err) {
    Logger.log('updateItemInSheet 오류: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

/**
 * 메인 시트에서 장비 행을 삭제하기 전 History에 기록하고, cascade 삭제합니다.
 */
function deleteItemFromSheet(itemId) {
  try {
    const ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
    const mainSheet = ss.getSheets()[0];
    const targetRow = findSheetRowByItemId(mainSheet, itemId);
    if (targetRow === -1) return { success: false, error: '해당 장비 행을 찾을 수 없습니다.' };

    // 삭제 전에 History 기록
    try {
      const item = getItemDataFromMainSheet(itemId);
      if (item) {
        writeHistoryRow(
          item.name, item.category, '삭제됨', item.location,
          item.user, '장비 삭제 처리', item.department, item.usageDate, ''
        );
      }
    } catch(e) {
      Logger.log('History 기록 오류 (deleteItem): ' + e.toString());
    }

    mainSheet.deleteRow(targetRow);
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
 */
function cascadeDeleteNotes(itemId) {
  const notesSheet  = getNotesSheet();
  const notesData   = notesSheet.getDataRange().getValues();
  const deletedNoteIds = [];

  for (let i = notesData.length - 1; i >= 1; i--) {
    if (String(notesData[i][0]) === itemId) {
      deletedNoteIds.push(String(notesData[i][1]));
      notesSheet.deleteRow(i + 1);
    }
  }

  if (deletedNoteIds.length > 0) {
    const photosSheet = getPhotosDataSheet();
    const photosData  = photosSheet.getDataRange().getValues();
    for (let j = photosData.length - 1; j >= 1; j--) {
      if (deletedNoteIds.includes(String(photosData[j][0]))) {
        photosSheet.deleteRow(j + 1);
      }
    }
  }

  return deletedNoteIds.length;
}

// ─── 권한 승인 (최초 1회 실행) ───────────────────────────────────────────────

function authorizeDriveAccess() {
  const folder = DriveApp.getFolderById('1Cf-zzI7mW39rLaw-B3jvx5fN99Ajv0Ur');
  Logger.log('폴더 확인: ' + folder.getName());
  const testFile = folder.createFile('_auth_test_삭제해도됩니다.txt', 'auth', MimeType.PLAIN_TEXT);
  testFile.setTrashed(true);
  Logger.log('Drive 쓰기 권한 확인 완료!');
}
