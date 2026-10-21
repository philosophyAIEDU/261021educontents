---
name: site
description: 관리자 페이지(Contents Input·Output 화면)를 내 사이트에 올린다. brand.md의 사이트 주소와 GitHub 저장소를 읽어 저장소를 내려받고, 사이트 종류(Next.js, Astro, Vite, Jekyll, 정적 HTML 등)에 맞는 공개 폴더에 contents-admin.html을 넣은 뒤, 확인을 받고 커밋·푸시한다. "내 사이트에 올려줘", "관리자 페이지 배포", "사이트 연결", "/site"라고 하면 실행한다. 관리자 페이지를 고친 뒤 다시 올릴 때도 쓴다.
---

# /site — 내 사이트에 관리자 페이지 올리기

작업 폴더: 이 프로젝트 폴더. 결과: `내 사이트 주소/contents-admin.html`에서 Google 로그인 후 Contents Input·Output을 본다. 데이터는 Firebase에 있고, 페이지는 내 계정(`firestore.rules`의 이메일)으로 로그인해야만 내용을 보여 준다.

## 절차
1. **준비 확인**
   - `brand.md`의 `사이트 주소`, `사이트 GitHub 저장소`가 비었으면 그것만 묻고 적는다 (`/start` 3절과 같은 방식).
   - `admin/index.html`의 `firebaseConfig`에 `YOUR_`가 남았으면: Firebase 콘솔 > 프로젝트 설정 > 일반 > 내 앱(웹)의 `firebaseConfig`를 붙여 달라고 해서 넣는다. 웹 앱이 없으면 `TUTORIAL.md` 6단계를 안내한다. `SITE_NAME`에는 brand.md의 `브랜드 이름`을 넣는다.
   - `firestore.rules`를 Firebase에 게시했는지 묻는다 (안 했으면 `TUTORIAL.md` 3-2단계). 이것이 "나만 보기"의 실제 잠금장치다.
2. **저장소 내려받기** (폴더: brand.md의 `사이트 저장소 폴더`, 기본 `site-repo`. git에 올라가지 않는다)
   - 폴더가 없으면 `git clone <사이트 GitHub 저장소> site-repo`
   - 있으면 `git -C site-repo pull`
   - 인증 오류(비공개 저장소)면: GitHub 로그인이 필요하다고 알리고 `gh auth login` 또는 GitHub Desktop으로 로그인한 뒤 다시 시도하게 한다. 토큰을 채팅에 붙이지 않게 한다.
3. **미리보기**: `node scripts/install-admin.mjs` → 사이트 종류, 설치 위치, 배포 후 주소를 사용자에게 보여 준다.
   - "알 수 없음"이거나 위치가 이상하면 사이트 구조를 살펴 공개 폴더(파일을 넣으면 그대로 주소가 되는 폴더)를 찾아 `--dir <폴더>`로 다시 미리보기 한다. 확신이 없으면 묻는다.
4. **복사**: `node scripts/install-admin.mjs --commit`
5. **확인 후 올리기** (사이트에 바로 반영되는 일이므로 **반드시 확인을 받는다**)
   - `git -C site-repo status --short`로 **바뀐 파일이 설치 파일 하나뿐인지** 확인한다. 다른 파일이 섞였으면 멈추고 알린다.
   - "`<주소>/contents-admin.html`로 사이트에 올립니다. 진행할까요?"라고 묻는다.
   - 확인이 나면: `git -C site-repo add <설치 파일 경로>` → `git -C site-repo commit -m "Add contents admin page"` → `git -C site-repo push`
   - 기본 브랜치에 바로 올리는 것이 부담스럽다고 하면 새 브랜치로 올리고 GitHub에서 PR로 합치는 방법을 안내한다.
6. **로그인 허용 (사용자가 직접)**: Firebase 콘솔 > Authentication > 설정 > **승인된 도메인**에 사이트 도메인(예: `mysite.com`)을 추가하게 한다. 이걸 안 하면 로그인 창이 오류를 낸다.
7. **확인**: 배포가 끝나면(Vercel·Netlify·GitHub Pages는 보통 1~3분) 주소를 열어 Google 로그인 → Contents Input 탭이 보이는지 묻는다. 문제가 생기면 `TUTORIAL.md`의 "문제 해결"을 따른다.
8. **기록**: `reports/site-log.md`에 날짜, 사이트 종류, 설치 경로, 커밋 결과를 추가한다.

## 다시 올릴 때
`admin/index.html`을 고쳤으면 2~7을 다시 한다 (6은 이미 했으면 생략). 설치 파일이 이미 같으면 스크립트가 "바꿀 것 없음"이라고 알려 준다.

## 금지
- 사용자 확인 없이 `push` 하지 않는다. 사이트 저장소의 다른 파일은 수정하지 않는다.
- `.env`, `keys/`, `processed/`, `drafts/`, `raw/`의 파일을 사이트 저장소에 넣지 않는다. 사이트에 올라가는 것은 관리자 페이지 파일 하나뿐이다 (데이터는 Firebase에서 로그인한 뒤에만 읽힌다).
