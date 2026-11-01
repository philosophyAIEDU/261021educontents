---
name: site
description: 이미 운영 중인 교수님 사이트(연구실·개인 홈페이지, GitHub로 배포되는 것)에 관리자 페이지(지식 창고·결과물 화면)만 넣는다. 사이트가 없으면 이 스킬이 아니라 /create-site로 새로 만든다. profile.md의 사이트 주소와 GitHub 저장소를 읽어 저장소를 내려받고, 사이트 종류(Next.js, Astro, Vite, Jekyll, 정적 HTML 등)에 맞는 공개 폴더에 knowledge-admin.html을 넣은 뒤, 확인을 받고 커밋·푸시한다. "내 사이트에 올려줘", "관리자 페이지 배포", "사이트 연결", "/site"라고 하면 실행한다. 관리자 페이지를 고친 뒤 다시 올릴 때도 쓴다.
---

# /site — 내 사이트에 관리자 페이지 올리기

작업 폴더: 이 프로젝트 폴더. 결과: `내 사이트 주소/knowledge-admin.html`에서 Google 로그인 후 지식 창고·결과물을 본다. 사이트가 없으면 이 스킬 대신 profile.md의 `관리자 페이지 보는 곳`을 `내 컴퓨터`로 바꾸고 `npx serve admin`으로 연다. 데이터는 Firebase에 있고, 페이지는 내 계정(`firestore.rules`의 이메일)으로 로그인해야만 내용을 보여 준다.

## 절차
1. **준비 확인**
   - `profile.md`의 `사이트 주소`, `사이트 GitHub 저장소`가 비었으면 그것만 묻고 적는다 (`/start` 3절과 같은 방식).
   - `admin/index.html`의 `firebaseConfig`에 `YOUR_`가 남았으면: Firebase 콘솔 > 프로젝트 설정 > 일반 > 내 앱(웹)의 `firebaseConfig`를 붙여 달라고 해서 넣는다. 웹 앱이 없으면 `TUTORIAL.md` 3-2단계 4번을 안내한다. `SITE_NAME`에는 profile.md의 `이름`을 넣는다.
   - **Firestore 규칙**: 이것이 "나만 보기"의 실제 잠금장치다. 규칙은 프로젝트 전체에 하나뿐이고, 올리면 기존 규칙 전체가 바뀐다. 먼저 아래 "규칙 올리기"대로 현재 규칙을 확인한다. (기존 사이트에는 '글' 영역이 없으므로 `public_posts` 게시는 쓰지 않는다)
2. **저장소 내려받기** (폴더: profile.md의 `사이트 저장소 폴더`, 기본 `site-repo`. git에 올라가지 않는다)
   - 폴더가 없으면 `git clone <사이트 GitHub 저장소> site-repo`
   - 있으면 `git -C site-repo pull`
   - 인증 오류(비공개 저장소)면: GitHub 로그인이 필요하다고 알리고 `gh auth login` 또는 GitHub Desktop으로 로그인한 뒤 다시 시도하게 한다. 토큰을 채팅에 붙이지 않게 한다.
3. **미리보기**: `node scripts/install-admin.mjs` → 사이트 종류, 설치 위치, 배포 후 주소를 사용자에게 보여 준다.
   - "알 수 없음"이거나 위치가 이상하면 사이트 구조를 살펴 공개 폴더(파일을 넣으면 그대로 주소가 되는 폴더)를 찾아 `--dir <폴더>`로 다시 미리보기 한다. 확신이 없으면 묻는다.
4. **복사**: `node scripts/install-admin.mjs --commit`
5. **확인 후 올리기** (사이트에 바로 반영되는 일이므로 **반드시 확인을 받는다**)
   - `git -C site-repo status --short`로 **바뀐 파일이 설치 파일 하나뿐인지** 확인한다. 예외는 "규칙 올리기" 5단계에서 교수님이 승인한 규칙 파일뿐이다. 다른 파일이 섞였으면 멈추고 알린다.
   - "`<주소>/knowledge-admin.html`로 사이트에 올립니다. 진행할까요?"라고 묻는다.
   - 확인이 나면: `git -C site-repo add <설치 파일 경로>` → `git -C site-repo commit -m "Add knowledge admin page"` → `git -C site-repo push`
   - 학교 서버(정적 호스팅)처럼 GitHub로 배포하지 않는 사이트면 푸시하지 말고, `admin/index.html`을 `knowledge-admin.html`로 내려받아 사이트 관리 화면에 직접 올리는 방법을 안내한다.
   - 기본 브랜치에 바로 올리는 것이 부담스럽다고 하면 새 브랜치로 올리고 GitHub에서 PR로 합치는 방법을 안내한다.
6. **로그인 허용 (사용자가 직접)**: Firebase 콘솔 > Authentication > 설정 > **승인된 도메인**에 사이트 도메인(예: `mysite.com`)을 추가하게 한다. 이걸 안 하면 로그인 창이 오류를 낸다.
7. **확인**: 배포가 끝나면(Vercel·Netlify·GitHub Pages는 보통 1~3분) 주소를 열어 Google 로그인 → 지식 창고 탭이 보이는지 묻는다. 문제가 생기면 `TUTORIAL.md`의 "문제 해결"을 따른다.
8. **기록**: `reports/site-log.md`에 날짜, 사이트 종류, 설치 경로, 커밋 결과를 추가한다.

## 규칙 올리기 (기존 규칙을 지우지 않는다)
이 폴더의 `firestore.rules`에는 지식 창고·결과물·게시 글 규칙만 있다. 기존 사이트에 그대로 올리면 가입, 게시판 같은 기존 기능의 규칙이 사라져 그 기능이 멈출 수 있다.

1. **현재 규칙 받기**: 교수님께 Firebase 콘솔 > Firestore Database > 규칙의 내용 전체를 복사해 붙여 달라고 한다 (비밀 값은 아니다. 서비스 계정 키와 다르다). 사이트 저장소에 규칙 파일(보통 `firestore.rules`)이 있으면 함께 읽고, 다르면 콘솔의 내용을 기준으로 삼고 다르다고 알린다.
2. **나누어 판단한다**
   | 현재 규칙 | 할 일 |
   |---|---|
   | `knowledge_input`·`knowledge_output` 규칙이 이미 있다 | 관리자 이메일만 확인한다. 같으면 올리지 않는다 |
   | 모든 접근을 막는 기본 규칙뿐이다 | `profile.md`의 `관리자 이메일`을 채우고 `node scripts/build-site.mjs --rules-only` 뒤 4단계로 간다 |
   | 다른 컬렉션 규칙이 있다 | 3단계에서 합친다 |
   | 전체를 여는 규칙이 있다 (`match /{document=**}`에 `if true`, `if request.auth != null`, 테스트 모드의 날짜 조건 등) | **멈추고 알린다.** 규칙은 하나라도 허용하면 허용되므로, 칸을 추가해도 지식 창고가 그 규칙으로 열린다. 올리지 않고, 이 규칙에 기대는 기능이 있는지 교수님과 확인한 뒤 정한다 |
   | 판단이 서지 않는다 | 올리지 않고 묻는다 |
3. **합치기**: `node scripts/build-site.mjs --rules-only`로 `site/`를 만든 뒤, `site/firestore.rules`를 **1단계의 현재 규칙 전체 + 아래 두 칸**으로 바꾼다. 기존 줄은 고치지 않는다. `isAdmin()`이 이미 있고 이메일이 `관리자 이메일`과 같으면 그대로 쓴다. 이메일이 다르면 묻는다. 없으면 이 폴더의 `firestore.rules`에서 `isAdmin()`을 가져와 이메일을 넣는다. 합친 뒤에는 `build-site`를 다시 실행하지 않는다 (합친 규칙을 덮어쓴다).
   ```
   match /knowledge_input/{docId} {
     allow read, write: if isAdmin();
   }
   match /knowledge_output/{docId} {
     allow read, write: if isAdmin();
   }
   ```
4. **확인 후 게시**: 추가한 줄을 보여 주고 "기존 규칙은 그대로 두고 이 줄만 추가합니다. 진행할까요?"라고 묻는다. 확인이 나면 교수님 로그인(`! npx --yes firebase-tools@15.32.1 login`) → `node --env-file=.env scripts/deploy-site.mjs --rules-only`(미리보기) → `--commit`.
5. **저장소와 맞추기**: 사이트 저장소에 규칙 파일이 있으면, 같은 줄을 추가해 관리자 페이지와 함께 올릴지 묻는다. 맞추지 않으면 나중에 저장소의 규칙을 올릴 때 두 칸이 사라진다.
6. **기존 기능 확인**: 게시 후 교수님께 기존 사이트의 로그인과 게시판 같은 기능이 그대로 되는지 봐 달라고 한다. 문제가 있으면 1단계에서 받은 규칙을 콘솔에 다시 게시해 되돌린다.

`/create-site`로 이 폴더에서 만든 사이트는 해당하지 않는다.

## 다시 올릴 때
`admin/index.html`을 고쳤으면 2~7을 다시 한다 (6은 이미 했으면 생략). 설치 파일이 이미 같으면 스크립트가 "바꿀 것 없음"이라고 알려 준다.

## 금지
- 사용자 확인 없이 `push` 하지 않는다. 사이트 저장소의 다른 파일은 수정하지 않는다 (승인받은 규칙 파일만 예외).
- 현재 규칙을 확인하지 않고 Firestore 규칙을 올리지 않는다.
- `.env`, `keys/`, `processed/`, `drafts/`, `raw/`의 파일을 사이트 저장소에 넣지 않는다. 이 폴더에서 사이트에 올리는 페이지는 관리자 페이지 파일 하나뿐이다 (데이터는 Firebase에서 로그인한 뒤에만 읽힌다).
