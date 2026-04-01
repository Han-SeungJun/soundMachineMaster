/**
 * SoundMaster Edit URL Generator
 *
 * 구글 폼의 "응답 수정" 링크를 구글 시트의 [K열]에 자동으로 기록해주는 스크립트입니다.
 *
 * [사용 방법]
 * 1. 메뉴 바에서 [실행] 버튼을 눌러 먼저 'populateEditLinks' 함수를 1회 실행하세요. (권한 허용 창이 뜨면 모두 허용해주세요)
 * 2. 화면 좌측의 시계(알람) 모양 아이콘인 [트리거] 메뉴로 이동합니다.
 * 3. 우측 하단의 [트리거 추가(Add Trigger)] 파란색 버튼을 클릭합니다.
 * 4. 트리거 설정을 다음과 같이 맞춥니다:
 *    - 실행할 함수: populateEditLinks
 *    - 실행해야 할 이벤트 소스: 스프레드시트에서
 *    - 이벤트 유형: 양식 제출 시 (또는 폼 제출 시)
 * 5. 저장을 누르면 이후부터 새로 등록되는 장비도 수정 링크가 자동으로 생성됩니다!
 */

const SPREADSHEET_ID = '1AWw7zH5PAGLLMgpQ5WfSN4-R7Cr2E2VeFxstQoxAU1k';

function populateEditLinks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  const formUrl = ss.getFormUrl();

  if (!formUrl) {
    Logger.log("연결된 설문지가 존재하지 않습니다. 먼저 폼을 시트에 연결해주세요.");
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
      const currentUrlInSheet = data[i][10];
      if (currentUrlInSheet !== editUrl) {
        sheet.getRange(i + 1, 11).setValue(editUrl);
      }
    }
  }
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'getNotes') {
      const notes = getNotesFromSheet(e.parameter.itemId);
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

// Notes 시트: GearID | NoteID | Status | Memo | (Photos - 미사용, 호환용 빈칸) | Date
function getNotesSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName("Notes");
  if (!sheet) {
    sheet = ss.insertSheet("Notes");
    sheet.appendRow(["GearID", "NoteID", "Status", "Memo", "Photos", "Date"]);
    sheet.getRange(1, 1, 1, 6).setFontWeight("bold").setBackground("#f3f3f3");
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

function getNotesFromSheet(itemId) {
  const notesSheet = getNotesSheet();
  const notesData = notesSheet.getDataRange().getValues();

  // PhotosData 시트에서 사진 로드 후 NoteID 기준으로 매핑
  const photosSheet = getPhotosDataSheet();
  const photosData = photosSheet.getDataRange().getValues();
  const photosMap = {};
  for (let i = 1; i < photosData.length; i++) {
    const nid = String(photosData[i][0]);
    if (!photosMap[nid]) photosMap[nid] = [];
    photosMap[nid].push({
      index: Number(photosData[i][1]),
      name: photosData[i][2] || '',
      data: photosData[i][3] || ''
    });
  }
  // PhotoIndex 기준 정렬
  Object.values(photosMap).forEach(function(arr) {
    arr.sort(function(a, b) { return a.index - b.index; });
  });

  const notes = [];
  for (let i = 1; i < notesData.length; i++) {
    if (notesData[i][0] == itemId) {
      const nid = String(notesData[i][1]);
      notes.push({
        itemId: notesData[i][0],
        id: notesData[i][1],
        status: notesData[i][2],
        memo: notesData[i][3],
        photos: (photosMap[nid] || []).map(function(p) {
          return { data: p.data, name: p.name };
        }),
        date: notesData[i][5]
      });
    }
  }
  return notes;
}

function addNoteToSheet(note) {
  const notesSheet = getNotesSheet();
  const photosSheet = getPhotosDataSheet();

  // 사진을 PhotosData 시트에 한 행씩 저장 (DriveApp 불필요)
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

  // Notes 시트에 메모 저장 (Photos 열은 호환용 빈 배열)
  notesSheet.appendRow([
    note.itemId,
    note.id,
    note.status || '',
    note.memo || '',
    '[]',
    note.date
  ]);

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

  // PhotosData 시트에서 해당 NoteID 사진 모두 삭제
  const photosSheet = getPhotosDataSheet();
  const photosData = photosSheet.getDataRange().getValues();
  for (let j = photosData.length - 1; j >= 1; j--) {
    if (String(photosData[j][0]) === String(noteId)) {
      photosSheet.deleteRow(j + 1);
    }
  }

  return { success: true };
}
