# MyHome 대시보드 — Google 로그인 + Drive 저장 설정

Apache/PHP 없이 정적 파일만으로 동작합니다. 브라우저에서 Google 로그인 후
데이터를 **내 Google Drive › `MyHome Dashboard` › `dashboard_data.json`** 에 저장·불러옵니다.

## 1. Google Cloud 설정 (최초 1회, 약 5분)

1. https://console.cloud.google.com 접속 → 상단에서 **새 프로젝트** 생성 (예: `myhome-dashboard`)
2. **API 및 서비스 › 라이브러리** → `Google Drive API` 검색 → **사용 설정**
3. **API 및 서비스 › OAuth 동의 화면** (Google 인증 플랫폼)
   - 사용자 유형: **외부**
   - 앱 이름 / 지원 이메일 / 개발자 이메일 입력
   - 범위(데이터 액세스): `.../auth/drive.file` 추가 (비민감 범위라 Google 심사 불필요)
   - **대상(테스트 사용자)** 에 본인 Gmail 추가
     - 테스트 상태로 두면 등록된 계정만 로그인 가능 (본인 전용이면 이대로 충분)
4. **API 및 서비스 › 사용자 인증 정보 › 사용자 인증 정보 만들기 › OAuth 클라이언트 ID**
   - 애플리케이션 유형: **웹 애플리케이션**
   - **승인된 JavaScript 원본** 에 대시보드를 열 주소의 *도메인 부분만* 추가
     - `https://hongjaang-star.github.io` (GitHub Pages 로 배포하는 경우)
     - `http://localhost` (기존처럼 XAMPP 에서도 쓰려면)
   - 리디렉션 URI 는 비워 둡니다
5. 생성된 **클라이언트 ID** (`xxxx.apps.googleusercontent.com`) 를 복사해
   `assets/js/config.js` 의 `GOOGLE_CLIENT_ID` 에 붙여 넣습니다.
   - 클라이언트 ID 는 공개되어도 되는 값입니다. **클라이언트 보안 비밀번호(secret)는 넣지 마세요.**

## 2. 어디서든 접속할 수 있게 배포

정적 파일(`index.html`, `assets/`)만 올리면 됩니다. 예: GitHub Pages

1. 이 폴더(`home_dashboard`) 내용만 담은 GitHub 저장소 생성 → push
2. 저장소 **Settings › Pages** → Branch `main` / `/ (root)` 선택 → 저장
3. 1~2분 후 `https://<계정>.github.io/<저장소>/` 로 접속
4. 이 주소의 도메인(`https://<계정>.github.io`)이 1-4 의 승인된 원본에 들어있어야 합니다

> `file://` 로 index.html 을 직접 열면 Google 로그인이 동작하지 않습니다 (Google 정책). 반드시 http(s) 주소로 여세요.

## 3. 사용 방법

| 상황 | 동작 |
|---|---|
| 처음 접속 | 로그인 안내 → **Google 계정으로 로그인** (또는 "이 기기에서만 사용") |
| 첫 로그인 (Drive 에 데이터 없음) | 현재 기기 데이터를 Drive 에 업로드 |
| 다른 기기에서 로그인 | Drive 데이터를 불러와 같은 화면 표시 |
| 위젯·메모·즐겨찾기·테마 변경 | 1.5초 후 Drive 에 자동 저장 (헤더 `☁ 저장됨`) |
| 다른 탭/기기에서 바뀐 뒤 돌아옴 | 탭 복귀 시 변경 확인 후 자동 반영 |
| 약 1시간 경과 (토큰 만료) | 헤더 `🔄 재연결` 클릭 → 한 번 클릭으로 재연결, 그 사이 변경분도 업로드 |
| 양쪽에서 동시에 바뀐 경우 | 어느 쪽을 남길지 확인창 표시 |
| 오프라인 | 로컬에 계속 저장, 온라인이 되면 업로드 |

- 헤더의 동기화 버튼 또는 **⚙️ 설정 › Google Drive 동기화** 에서 지금 동기화 / Drive 에서 불러오기 / 로그아웃
- Drive 는 파일 변경 이력을 자동 보관하므로, 실수로 덮어써도 Drive 웹에서 `dashboard_data.json` › **버전 관리** 로 되돌릴 수 있습니다
- 권한은 `drive.file` 하나뿐 — 이 앱이 만든 파일 외에는 Drive 의 다른 파일을 볼 수 없습니다
- 날씨 캐시는 동기화하지 않습니다 (기기마다 새로 받음)

## 4. 보안·데이터 보호

**유출 방지**
- 저장소에는 비밀값이 없습니다. 클라이언트 ID 는 공개용 값이며, 데이터는 각자의 Drive 에만 저장됩니다
- Google 액세스 토큰(1시간 유효)은 브라우저 localStorage 에만 보관되고, 로그아웃 시 폐기(revoke)됩니다
- 위젯 출력은 모두 이스케이프하고, `javascript:` 링크·잘못된 위젯 ID·알 수 없는 키를 거부합니다
- CSP 로 스크립트 출처와 통신 대상을 Google·wttr.in 으로 제한합니다
- **공용 PC** 에서는 로그아웃할 때 두 번째 확인창에서 [확인] → 이 기기의 메모·즐겨찾기·일정까지 삭제

**유실 방지**
- 업로드 전에 Drive 가 그 사이 바뀌었는지 확인하고, 바뀌었으면 덮어쓰지 않고 어느 쪽을 남길지 묻습니다
- Drive 파일이 손상됐거나 비어 있으면 이 기기 데이터를 지우지 않습니다 (손상 시 설정 › 📤 Drive에 덮어쓰기로 복구)
- Drive 데이터·설정 파일로 덮어쓰기 직전의 이 기기 데이터를 1건 보관 → 설정 › ↩ 이전 데이터 복원
- Drive 쪽은 Google 이 파일 버전을 자동 보관 (Drive 웹 › 파일 › 버전 관리)
- 같은 기기의 다른 탭에서 바뀌면 이 탭도 자동 갱신 (오래된 탭이 최신 내용을 덮어쓰지 않음)
- 주의: `GOOGLE_CLIENT_ID` 를 다른 프로젝트 것으로 바꾸면 이전 파일이 보이지 않습니다 (drive.file 은 만든 앱 기준). 바꾸기 전에 ⚙️ › 📤 내보내기로 백업하세요

## 구성 파일

- `assets/js/config.js` — 클라이언트 ID, Drive 폴더/파일 이름
- `assets/js/drive-sync.js` — 로그인, Drive 읽기/쓰기, 충돌 처리
- `assets/js/storage.js` — localStorage(오프라인 캐시) + 변경 알림
