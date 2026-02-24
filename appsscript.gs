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
  
  // 11번째 열(K열)에 수정 링크 컬럼을 생성합니다.
  if (data[0].length < 11 || data[0][10] !== "수정 링크") {
    sheet.getRange(1, 11).setValue("수정 링크");
  }
  
  // 데이터 행의 개수에 맞게 수정 링크를 가져옵니다.
  // 응답 순서와 시트의 행 순서가 일치한다고 가정합니다.
  for (let i = 1; i < data.length; i++) {
    // 응답 배열은 0부터 시작하므로 리스폰스는 i-1
    if (responses[i - 1]) {
      const editUrl = responses[i - 1].getEditResponseUrl();
      const currentUrlInSheet = data[i][10]; // 배열에서 10번째가 K열
      
      // 혹시 비어있거나 다르면 업데이트
      if (currentUrlInSheet !== editUrl) {
        sheet.getRange(i + 1, 11).setValue(editUrl);
      }
    }
  }
}
