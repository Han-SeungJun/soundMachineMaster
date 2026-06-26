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
 * 폼 응답과 시트 행을 타임스탬프 기준으로 매핑하여 수정 링크를 J열에 기록합니다.
 * PropertiesService로 행 컨텐츠 해시를 관리하여 신규 등록과 수정 모두 History에 기록합니다.
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

  // PropertiesService로 행 컨텐츠 변경 감지 (신규 등록 + 수정 모두 History 기록)
  const props = PropertiesService.getScriptProperties();

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
      if (data[i][linkColIdx] !== editUrl) {
        sheet.getRange(i + 1, linkColIdx + 1).setValue(editUrl);
      }

      // 행 컨텐츠 직렬화 → 이전 값과 비교하여 변경 감지
      const rowKey = 'row_' + cellTs;
      const rowContent = [
        getField(data[i], '장비명'),
        getField(data[i], '카테고리'),
        getField(data[i], '상태'),
        getField(data[i], '위치'),
        getField(data[i], '사용자'),
        getField(data[i], '사용 목적'),
        getField(data[i], '사용 부서'),
        getField(data[i], '사용 날짜')
      ].join('|');

      const prevContent = props.getProperty(rowKey) || '';
      if (prevContent !== rowContent) {
        writeHistoryRow(
          getField(data[i], '장비명'),
          getField(data[i], '카테고리'),
          getField(data[i], '상태'),
          getField(data[i], '위치'),
          getField(data[i], '사용자'),
          getField(data[i], '사용 목적'),
          getField(data[i], '사용 부서'),
          getField(data[i], '사용 날짜'),
          editUrl,
          '' // 폼 제출/수정은 noteId 없음
        );
        props.setProperty(rowKey, rowContent);
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
      '사용 부서', '사용 날짜', '수정 링크', '참조ID'
    ]);
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#f3f3f3');
    // 사용일시 열 날짜 형식 지정
    sheet.getRange('A:A').setNumberFormat('yyyy. M. d. HH:mm:ss');
  }
  return sheet;
}

/**
 * History 시트에 이력 행을 추가합니다.
 * @param {string} refId - 연결된 noteId (노트 삭제 시 History 연동 삭제용, 없으면 '')
 */
function writeHistoryRow(name, category, status, location, user, purpose, department, usageDate, editUrl, refId) {
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
      editUrl    || '',
      refId      || ''  // K열: 참조ID
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
    } else if (action === 'rentSet') {
      return ContentService.createTextOutput(JSON.stringify(rentSetItems(params)))
        .setMimeType(ContentService.MimeType.JSON);
    } else if (action === 'saveSet') {
      return ContentService.createTextOutput(JSON.stringify(saveSetToSheet(params)))
        .setMimeType(ContentService.MimeType.JSON);
    } else if (action === 'updateSet') {
      return ContentService.createTextOutput(JSON.stringify(updateSetInSheet(params)))
        .setMimeType(ContentService.MimeType.JSON);
    } else if (action === 'deleteSet') {
      return ContentService.createTextOutput(JSON.stringify(deleteSetFromSheet(params)))
        .setMimeType(ContentService.MimeType.JSON);
    } else if (action === 'toggleFavorite') {
      return ContentService.createTextOutput(JSON.stringify(toggleFavoriteInSheet(params)))
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
    // 프론트에서 itemMeta 전달된 경우 바로 사용 → 추가 시트 조회 없이 처리
    try {
      const item = (note.itemMeta && note.itemMeta.name)
        ? note.itemMeta
        : getItemDataFromMainSheet(note.itemId);
      if (item) {
        writeHistoryRow(
          item.name, item.category, note.status, item.location,
          item.user, note.memo || item.purpose,
          item.department, item.usageDate, item.editUrl,
          String(note.id) // 참조ID = noteId (삭제 연동용)
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
  // 연결된 History 행도 삭제 (참조ID = noteId)
  deleteHistoryRowsByRef(String(noteId));
  return { success: true };
}

/**
 * History 시트에서 참조ID(K열)가 일치하는 행을 모두 삭제합니다.
 * @param {string} refId - 삭제할 noteId
 */
function deleteHistoryRowsByRef(refId) {
  if (!refId) return;
  try {
    const sheet = getHistorySheet();
    const data  = sheet.getDataRange().getValues();
    const refColIdx = 10; // K열 (0-based)
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][refColIdx]) === refId) {
        sheet.deleteRow(i + 1);
      }
    }
  } catch(e) {
    Logger.log('deleteHistoryRowsByRef 오류: ' + e.toString());
  }
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
      department: '사용 부서',
      usageDate:  '사용 날짜'
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
        g('사용자'), g('사용 목적'), g('사용 부서'), g('사용 날짜'), g('수정 링크'), ''
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
          item.user, '장비 삭제 처리', item.department, item.usageDate, '', ''
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

// ─── 세트/사용자/대여묶음 시트 헬퍼 (자동생성 안 함 — 탭은 수동 생성됨) ──────────

/**
 * 이름으로 기존 시트를 가져옵니다. 없으면 명확한 에러(자동생성하지 않음).
 * @param {string} name
 * @returns {Sheet}
 */
function getRequiredSheet_(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('시트 없음: "' + name + '" 탭을 먼저 생성하세요.');
  return sheet;
}

function getSetsSheet()        { return getRequiredSheet_('Sets'); }
function getSetItemsSheet()    { return getRequiredSheet_('SetItems'); }
function getRentBundlesSheet() { return getRequiredSheet_('RentBundles'); }
function getUsersSheet()       { return getRequiredSheet_('Users'); }

/**
 * 시트 헤더 행을 읽어 {헤더명: 0-based 인덱스} 맵과 메타를 반환합니다.
 */
function headerColMap_(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const map = {};
  headers.forEach(function(h, i) { if (h) map[String(h).trim()] = i; });
  return { headers: headers, map: map, lastCol: lastCol };
}

/** 헤더 맵에서 라벨(정확/포함)로 0-based 컬럼 인덱스를 찾습니다. 없으면 -1. */
function colIndex_(map, label) {
  if (map[label] !== undefined) return map[label];
  for (var h in map) { if (h.indexOf(label) !== -1) return map[h]; }
  return -1;
}

/** {헤더라벨: 값} 객체를 헤더 위치에 맞춰 1행 append 합니다(컬럼 순서 비의존). */
function appendByHeaders_(sheet, valuesByLabel) {
  const info = headerColMap_(sheet);
  const row  = [];
  for (var i = 0; i < info.lastCol; i++) row.push('');
  Object.keys(valuesByLabel).forEach(function(label) {
    const idx = colIndex_(info.map, label);
    if (idx !== -1) row[idx] = valuesByLabel[label];
  });
  sheet.appendRow(row);
}

/** 특정 라벨 컬럼 값이 일치하는 모든 행을 삭제합니다. 삭제 건수 반환. */
function deleteRowsWhere_(sheet, label, value) {
  const info = headerColMap_(sheet);
  const idx  = colIndex_(info.map, label);
  if (idx === -1) return 0;
  const data = sheet.getDataRange().getValues();
  var count = 0;
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][idx]) === String(value)) { sheet.deleteRow(i + 1); count++; }
  }
  return count;
}

// ─── 세트 일괄 대여 (rentSet) ────────────────────────────────────────────────

/**
 * 여러 장비를 단일 호출에서 일괄 '대여중' 처리하고 건별 History 1행씩 기록합니다.
 * 중복 기록 방지: updateItemInSheet를 호출하지 않고 행을 직접 갱신 후 writeHistoryRow 1회.
 * @param {{items:Array, common:Object, bundle:Object}} params
 * @returns {{success:boolean, succeeded:Array, failed:Array}}
 */
function rentSetItems(params) {
  const items  = params.items  || [];
  const common = params.common || {};
  const bundle = params.bundle || {};

  const ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
  const mainSheet = ss.getSheets()[0];
  const lastCol   = mainSheet.getLastColumn();
  const headers   = mainSheet.getRange(1, 1, 1, lastCol).getValues()[0];

  const colMap = {};
  headers.forEach(function(h, i) { if (h) colMap[String(h).trim()] = i + 1; }); // 1-based
  const findCol = function(label) {
    if (colMap[label]) return colMap[label];
    for (var h in colMap) { if (h.indexOf(label) !== -1) return colMap[h]; }
    return -1;
  };

  const statusCol  = findCol('상태');
  const userCol    = findCol('사용자');
  const purposeCol = findCol('사용 목적');
  const deptCol    = findCol('사용 부서');
  const dateCol    = findCol('사용 날짜');

  const succeeded = [];
  const failed    = [];

  items.forEach(function(it) {
    try {
      const row = findSheetRowByItemId(mainSheet, it.itemId);
      if (row === -1) { failed.push(it.itemId); return; }

      if (statusCol  > 0) mainSheet.getRange(row, statusCol ).setValue('대여중');
      if (userCol    > 0 && common.user       != null) mainSheet.getRange(row, userCol   ).setValue(common.user);
      if (purposeCol > 0 && common.purpose    != null) mainSheet.getRange(row, purposeCol).setValue(common.purpose);
      if (deptCol    > 0 && common.department != null) mainSheet.getRange(row, deptCol   ).setValue(common.department);
      if (dateCol    > 0 && common.usageDate  != null) mainSheet.getRange(row, dateCol   ).setValue(common.usageDate);

      // 갱신된 행 기준 History 1회 기록
      const updatedRow = mainSheet.getRange(row, 1, 1, lastCol).getValues()[0];
      const ci = {};
      headers.forEach(function(h, i) { if (h) ci[String(h).trim()] = i; });
      const g = function(label) {
        for (var h in ci) { if (h === label || h.indexOf(label) !== -1) return String(updatedRow[ci[h]] || '').trim(); }
        return '';
      };
      writeHistoryRow(
        g('장비명'), g('카테고리'), g('상태'), g('위치'),
        g('사용자'), g('사용 목적'), g('사용 부서'), g('사용 날짜'), g('수정 링크'), ''
      );
      succeeded.push(it.itemId);
    } catch (e) {
      Logger.log('rentSet 개별 오류 itemId=' + it.itemId + ': ' + e.toString());
      failed.push(it.itemId);
    }
  });

  // 성공분이 있으면 RentBundles에 1행 기록 (실패해도 대여 자체는 성공 처리)
  if (succeeded.length > 0) {
    try { recordRentBundle_(common, bundle); }
    catch (e) { Logger.log('RentBundles 기록 오류: ' + e.toString()); }
  }

  return { success: failed.length === 0, succeeded: succeeded, failed: failed };
}

/** RentBundles 시트에 대여 묶음 1행을 append 합니다(v1: 항상 append). */
function recordRentBundle_(common, bundle) {
  const sheet = getRentBundlesSheet();
  const now   = new Date();
  appendByHeaders_(sheet, {
    'BundleID':   'B' + now.getTime(),
    'UserName':   common.user       || '',
    'SetID':      bundle.setId      || '',
    'SetName':    bundle.setName    || '',
    'Team':       bundle.team       || '',
    'ItemNames':  bundle.itemNames  || '',
    'Purpose':    common.purpose    || '',
    'Department': common.department || '',
    'UsageDate':  common.usageDate  || '',
    'IsFavorite': false,
    'UseCount':   1,
    'LastUsedAt': now,
    'CreatedAt':  now
  });
}

// ─── 세트 마스터/구성 CRUD (saveSet / updateSet / deleteSet) ──────────────────

/**
 * Sets 마스터 1행 + SetItems 구성 N행을 추가합니다.
 * @param {{set:Object, items:Array}} params
 */
function saveSetToSheet(params) {
  const set   = params.set   || {};
  const items = params.items || [];
  const now   = new Date();
  const setId = set.setId || ('SET' + now.getTime());

  appendByHeaders_(getSetsSheet(), {
    'SetID': setId, 'SetName': set.setName || '', 'Team': set.team || '',
    'Description': set.description || '', 'Icon': set.icon || '', 'Color': set.color || '',
    'IsActive': (set.isActive === false ? false : true),
    'SortOrder': (set.sortOrder != null ? set.sortOrder : ''),
    'CreatedBy': set.createdBy || '',
    'CreatedAt': (set.createdAt || now), 'UpdatedAt': now
  });

  const itemsSheet = getSetItemsSheet();
  items.forEach(function(it, idx) {
    appendByHeaders_(itemsSheet, {
      'SetID': setId, 'ItemName': it.itemName || '', 'Category': it.category || '',
      'Quantity': (it.quantity != null ? it.quantity : 1),
      'SortOrder': (it.sortOrder != null ? it.sortOrder : (idx + 1)),
      'Note': it.note || ''
    });
  });

  return { success: true, setId: setId };
}

/** 기존 setId의 마스터·구성을 삭제 후 재작성합니다(CreatedAt 보존). */
function updateSetInSheet(params) {
  const setId = params.setId;
  if (!setId) return { success: false, error: 'setId 누락' };

  // 기존 CreatedAt 보존
  try {
    const info = headerColMap_(getSetsSheet());
    const idCol = colIndex_(info.map, 'SetID');
    const caCol = colIndex_(info.map, 'CreatedAt');
    if (idCol !== -1 && caCol !== -1) {
      const data = getSetsSheet().getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][idCol]) === String(setId)) {
          params.set = params.set || {};
          if (data[i][caCol]) params.set.createdAt = data[i][caCol];
          break;
        }
      }
    }
  } catch (e) { Logger.log('updateSet CreatedAt 보존 오류: ' + e.toString()); }

  deleteSetRows_(setId);
  params.set = params.set || {};
  params.set.setId = setId;
  return saveSetToSheet(params);
}

function deleteSetFromSheet(params) {
  const setId = params.setId;
  if (!setId) return { success: false, error: 'setId 누락' };
  const n = deleteSetRows_(setId);
  return { success: true, deleted: n };
}

function deleteSetRows_(setId) {
  var count = 0;
  count += deleteRowsWhere_(getSetsSheet(),     'SetID', setId);
  count += deleteRowsWhere_(getSetItemsSheet(), 'SetID', setId);
  return count;
}

// ─── 즐겨찾기 토글 (toggleFavorite) ──────────────────────────────────────────

function toggleFavoriteInSheet(params) {
  const bundleId = params.bundleId;
  if (!bundleId) return { success: false, error: 'bundleId 누락' };

  const sheet  = getRentBundlesSheet();
  const info   = headerColMap_(sheet);
  const idCol  = colIndex_(info.map, 'BundleID');
  const favCol = colIndex_(info.map, 'IsFavorite');
  if (idCol === -1 || favCol === -1) return { success: false, error: 'BundleID/IsFavorite 컬럼 없음' };

  const fav  = (params.isFavorite === true || params.isFavorite === 'true');
  const data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(bundleId)) {
      sheet.getRange(i + 1, favCol + 1).setValue(fav);
      return { success: true };
    }
  }
  return { success: false, error: '해당 묶음 없음' };
}

// ─── 권한 승인 (최초 1회 실행) ───────────────────────────────────────────────

function authorizeDriveAccess() {
  const folder = DriveApp.getFolderById('1Cf-zzI7mW39rLaw-B3jvx5fN99Ajv0Ur');
  Logger.log('폴더 확인: ' + folder.getName());
  const testFile = folder.createFile('_auth_test_삭제해도됩니다.txt', 'auth', MimeType.PLAIN_TEXT);
  testFile.setTrashed(true);
  Logger.log('Drive 쓰기 권한 확인 완료!');
}
