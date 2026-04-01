/**
 * SoundMaster Edit URL Generator
 *
 * 구글 폼의 "응답 수정" 링크를 구글 시트의 [K열]에 자동으로 기록해주는 스크립트입니다.
 *
 * [사용 방법]
 * 1. 메뉴 바에서 [실행] 버튼을 눌러 먼저 'populateEditLinks' 함수를 1회 실행하세요.
 * 2. [트리거] 메뉴 → [트리거 추가] → populateEditLinks / 스프레드시트에서 / 양식 제출 시
 */

const SPREADSHEET_ID = '1AWw7zH5PAGLLMgpQ5WfSN4-R7Cr2E2VeFxstQoxAU1k';

function populateEditLinks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  const formUrl = ss.getFormUrl();

  if (!formUrl) {
    Logger.log("연결된 설문지가 존재하지 않습니다.");
    return;
  }

  const form = FormApp.openByUrl(formUrl);
  const responses = form.getResponses();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) return;

  if (data[0].length < 11 || data[0][10] !== "수정 링크") {
    sheet.getRange(1, 11).setValue("수정 링크");
  }

  for (let i = 1; i < data.length; i++) {
    if (responses[i - 1]) {
      const editUrl = responses[i - 1].getEditResponseUrl();
      if (data[i][10] !== editUrl) {
        sheet.getRange(i + 1, 11).setValue(editUrl);
      }
    }
  }
}

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
    }
    return ContentService.createTextOutput(JSON.stringify({ error: 'Unknown action' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Notes 시트: GearID | NoteID | Status | Memo | Date  (Photos 컬럼 없음)
function getNotesSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName("Notes");
  if (!sheet) {
    sheet = ss.insertSheet("Notes");
    sheet.appendRow(["GearID", "NoteID", "Status", "Memo", "Date"]);
    sheet.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#f3f3f3");
  }
  return sheet;
}

// PhotosData 시트: NoteID | PhotoIndex | Filename | Base64Data
function getPhotosDataSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName("PhotosData");
  if (!sheet) {
    sheet = ss.insertSheet("PhotosData");
    sheet.appendRow(["NoteID", "PhotoIndex", "Filename", "Base64Data"]);
    sheet.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#f3f3f3");
  }
  return sheet;
}

/**
 * includePhotos=false(기본): PhotosData 시트를 읽지 않아 빠름 → 대시보드/배너용
 * includePhotos=true: PhotosData 포함 → 상세 모달 사진 표시용
 */
function getNotesFromSheet(itemId, includePhotos) {
  const notesSheet = getNotesSheet();
  const notesData = notesSheet.getDataRange().getValues();

  // 컬럼 순서: [0]GearID [1]NoteID [2]Status [3]Memo [4]Date
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
    if (notesData[i][0] == itemId) {
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

/**
 * 메인 시트("설문지 응답 시트1")의 "상태" 컬럼을 업데이트합니다.
 * itemId는 1-based 데이터 행 번호 (헤더 포함 시 +1이 실제 시트 행).
 * 삭제 시에는 호출하지 않습니다.
 */
function syncStatusToMainSheet(itemId, newStatus) {
  if (!newStatus) return;
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const mainSheet = ss.getSheets()[0]; // 설문지 응답 시트1 (첫 번째 시트)
    const headers = mainSheet.getRange(1, 1, 1, mainSheet.getLastColumn()).getValues()[0];

    // "상태" 컬럼 위치 탐색 (1-based)
    let statusCol = -1;
    for (let i = 0; i < headers.length; i++) {
      if (headers[i] && String(headers[i]).includes('상태')) {
        statusCol = i + 1;
        break;
      }
    }
    if (statusCol === -1) {
      Logger.log('syncStatusToMainSheet: "상태" 컬럼을 찾을 수 없습니다.');
      return;
    }

    // itemId는 데이터 행 1-based → 시트 행 = itemId + 1 (헤더 행 제외)
    const sheetRow = parseInt(itemId) + 1;
    if (sheetRow < 2 || sheetRow > mainSheet.getLastRow()) {
      Logger.log('syncStatusToMainSheet: 유효하지 않은 행 번호 ' + sheetRow);
      return;
    }

    mainSheet.getRange(sheetRow, statusCol).setValue(newStatus);
    Logger.log('syncStatusToMainSheet: 행 ' + sheetRow + ' 상태 → ' + newStatus);
  } catch (err) {
    Logger.log('syncStatusToMainSheet 오류: ' + err.toString());
  }
}

function addNoteToSheet(note) {
  const notesSheet = getNotesSheet();
  const photosSheet = getPhotosDataSheet();

  // 사진 → PhotosData 시트에 한 행씩 저장
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

  // Notes 시트 저장 (5컬럼, Photos 없음)
  notesSheet.appendRow([
    note.itemId,
    note.id,
    note.status || '',
    note.memo || '',
    note.date
  ]);

  // 상태 변경이 있으면 메인 시트("설문지 응답 시트1")의 "상태" 컬럼도 동기화
  // (삭제 시에는 호출 안 함 → 메인 시트 값 유지)
  if (note.status) {
    syncStatusToMainSheet(note.itemId, note.status);
  }

  return { success: true, photoErrors: [] };
}

function deleteNoteFromSheet(itemId, noteId) {
  // Notes 시트에서 삭제
  const notesSheet = getNotesSheet();
  const notesData = notesSheet.getDataRange().getValues();
  for (let i = notesData.length - 1; i >= 1; i--) {
    if (notesData[i][0] == itemId && notesData[i][1] == noteId) {
      notesSheet.deleteRow(i + 1);
    }
  }

  // PhotosData 시트에서 해당 NoteID 사진 삭제
  const photosSheet = getPhotosDataSheet();
  const photosData = photosSheet.getDataRange().getValues();
  for (let j = photosData.length - 1; j >= 1; j--) {
    if (String(photosData[j][0]) === String(noteId)) {
      photosSheet.deleteRow(j + 1);
    }
  }

  return { success: true };
}
