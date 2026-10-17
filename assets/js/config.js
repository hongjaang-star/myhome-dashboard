/* ========================================
   config.js — 배포 환경 설정
   ----------------------------------------
   GOOGLE_CLIENT_ID : Google Cloud Console > API 및 서비스 > 사용자 인증 정보
                      > OAuth 2.0 클라이언트 ID(웹 애플리케이션) 의 "클라이언트 ID"
                      (공개되어도 되는 값입니다. 클라이언트 보안 비밀번호는 넣지 마세요.)
   설정 방법은 GOOGLE_DRIVE_SETUP.md 참고
   ======================================== */
window.DASH_CONFIG = {
  GOOGLE_CLIENT_ID : '',
  DRIVE_FOLDER_NAME: 'MyHome Dashboard',
  DRIVE_FILE_NAME  : 'dashboard_data.json',
};
