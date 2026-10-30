---
name: create-site
description: 교수님 개인 사이트(소개·연구 분야·강의·논문·연락처·글)를 새로 만들고 Firebase(Hosting·Firestore·Google 로그인)에 연동해 https://<프로젝트>.web.app 으로 올린다. 같은 사이트에 관리자 페이지(knowledge-admin.html)가 함께 올라가고, 결과물을 "사이트에 게시"하면 사이트의 '글'에 나온다. 사이트와 Firebase가 이미 있는 교수님은 쓰지 않는다. 아직 사이트가 없다고 직접 말할 때만 쓴다. "사이트 만들어 주세요", "홈페이지 만들기", "내 사이트가 없어요", "/create-site"라고 하면 실행한다. 이 폴더로 만든 사이트의 내용을 고쳐 다시 올릴 때도 쓴다("/create-site 다시 올리기"). 이미 있는 사이트에 관리자 페이지만 넣을 때는 /site를 쓴다.
---

# /create-site — 내 사이트 만들기 + Firebase 연동

작업 폴더: 이 프로젝트 폴더. 교수님은 개발에 익숙하지 않다. **한 번에 한 단계만**, 존댓말로, 화면에서 무엇을 누르는지 구체적으로 안내한다. 지금 단계가 끝났는지 확인한 뒤 다음으로 간다.

**먼저 확인**: 이 프로젝트의 교수님은 보통 사이트와 Firebase를 이미 갖고 있다. 올리기(`deploy-site.mjs --commit`)는 Firebase Hosting의 사이트 **전체를 이 폴더의 내용으로 바꾼다.** 그래서 시작하기 전에 "이미 올라간 사이트가 있으신가요?"라고 묻는다. 있는데 `site-content.md`가 빈 템플릿이거나 다른 폴더·다른 도구로 만든 사이트면 멈추고, 덮어써진다고 알린 뒤 `/start`로 돌아간다 (Firebase 연결은 `/start` 2절, 관리자 페이지 넣기는 `/site`).

만드는 것:
```
https://<프로젝트ID>.web.app                       공개 사이트 (소개·연구·강의·논문·연락처·글)
https://<프로젝트ID>.web.app/knowledge-admin.html  관리자 페이지 (교수님 구글 계정으로만 열림)
Firebase 프로젝트 하나 = Hosting(사이트) + Firestore(지식 창고·결과물·게시 글) + Authentication(Google 로그인)
```
사이트 원본은 `site-content.md`(내용), `site-assets/`(사진), `site-template/`(모양)이고, `node scripts/build-site.mjs`가 `site/public/`을 만든다. `site/`는 매번 새로 만들어지며 git에 올라가지 않는다.

먼저 상태를 본다: `profile.md`(이름·소속·관리자 이메일), `site-content.md`가 빈 템플릿인지, `admin/index.html`의 firebaseConfig에 `YOUR_`가 남았는지, `keys/`의 `.json` 파일 이름과 `.env` 존재(내용은 읽지 않는다), `site/` 유무. 이미 끝난 단계는 건너뛰고 지금 단계부터 시작한다. 처음이면 "세 부분으로 진행합니다: ① 사이트 내용 만들기(제가 대신 씁니다, 15분) ② Firebase 만들기(교수님이 화면을 눌러 주셔야 합니다, 15분) ③ 연결하고 올리기(제가 합니다)"라고 한 번 알린다.

## ① 사이트 내용 만들기 (Firebase 없이 내 컴퓨터에서)

1. **프로필**: `profile.md`의 `이름`(사이트에 보일 표기, 예: "홍길동 교수"), `소속`을 묻고 적는다. `관리자 이메일`은 "관리자 페이지에 로그인할 구글 계정"이라고 설명하고 묻는다 (공개 사이트에는 나오지 않고 Firestore 규칙에만 들어간다고 알린다). 학교 계정(Google Workspace)은 학교가 Firebase를 막아 둔 경우가 있어 **개인 구글 계정**을 권한다.
2. **내용 모으기** (`site-content.md`): 한두 가지씩 묻는다.
   - 교수님이 가진 것부터 받는다: 학교 교수 소개 페이지 주소, 이력서·소개 글 파일(`raw/`에 넣은 .docx·.hwpx·.pdf는 `node scripts/extract.mjs --file raw/<파일> --list`로 내용만 보고 정리에 쓴다), 기존 블로그 소개. 교수 소개 페이지는 교수님 본인 페이지임을 확인한 뒤에만 읽는다.
   - 받은 것이 없으면 질문으로 채운다: 한 줄 소개 → 소개(무엇을 연구하고 가르치는지, 왜) → 연구 분야 → 강의(과목명·대상) → 논문·저서 → 연락처(공개해도 되는 것만).
   - `knowledge-map.md`가 채워져 있으면 연구 분야·소개의 재료로 제안할 수 있다 (교수님 확인 후).
   - **지어내지 않는다.** 논문·저서·경력·수상은 교수님이 준 정보에 있는 것만, 서지 정보는 받은 그대로 쓴다. 모르면 그 절을 비워 둔다 (빈 절은 사이트에 안 나온다). 소개 글은 교수님 말을 다듬되 과장하지 않는다 (`voice.md` 금칙어가 있으면 따른다).
   - 학생 이름, 휴대전화 번호, 집 주소, 미발표 연구는 넣지 않는다.
   - 다 쓰면 맨 위 "상태" 줄을 `채움 (YYYY-MM-DD)`로 바꾼다.
3. **사진** (선택): `site-assets/` 폴더에 `photo.jpg`(또는 `.png`, `.webp`)로 넣어 달라고 한다. 없어도 된다.
4. **만들고 미리 보기**: `node scripts/build-site.mjs` → `npx serve site/public`을 백그라운드로 실행하고 `http://localhost:3000`을 열어 보게 한다. "고칠 곳을 말씀해 주세요"라고 묻고, 내용은 `site-content.md`를, 색은 `site-template/style.css`의 `:root`를 고친 뒤 다시 만든다. 미리 보기를 마치면 서버를 끈다.
   - 이 단계에서는 '글' 영역과 관리자 페이지가 아직 없다 (Firebase 연결 후 생긴다)고 알린다.

## ② Firebase 만들기 (교수님이 직접, 한 화면씩)

`TUTORIAL.md` 3-2단계와 같다. 화면을 볼 수 없으므로 단계마다 "지금 무엇이 보이시나요?"라고 묻는다.
1. [Firebase 콘솔](https://console.firebase.google.com) → **프로젝트 추가**. **프로젝트 이름이 사이트 주소가 된다**고 먼저 알린다 (예: `hong-lab` → `hong-lab.web.app`, 이미 쓰는 이름이면 뒤에 글자가 붙는다). Google 애널리틱스는 꺼도 된다.
2. **빌드 → Firestore Database → 데이터베이스 만들기** → 위치 `asia-northeast3 (서울)`, **프로덕션 모드**. (규칙은 ③에서 제가 올리므로 규칙 탭은 건드리지 않아도 된다)
3. **빌드 → Authentication → 시작하기 → 로그인 방법 → Google** 사용 설정 → 저장.
4. ⚙ **프로젝트 설정 → 일반**: **프로젝트 ID**를 알려 달라고 한다 (공개 값). 같은 화면 아래 **내 앱 → 웹(`</>`)** → 앱 등록(이름 아무거나, "Firebase Hosting 설정" 체크는 안 해도 된다) → 나오는 `firebaseConfig { ... }`를 붙여 달라고 한다 (공개 값이라 채팅에 붙여도 된다).
5. ⚙ **프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성** → 받은 파일을 이 폴더의 `keys/`에 `service-account.json`으로 넣게 한다. **이 파일은 채팅에 붙이지 말라**고 꼭 말한다. (지식 창고에 자료를 올릴 때 쓰는 열쇠다)
6. `.env`: `.env.example`을 `.env`로 복사해 주고(`cp .env.example .env`), `FIREBASE_PROJECT_ID=<프로젝트 ID>`는 **교수님이 직접** 메모장으로 적게 한다. 내용은 읽지 않는다.

## ③ 연결하고 올리기 (Claude)

1. 받은 firebaseConfig를 `admin/index.html`의 `firebaseConfig`에, `profile.md`의 `이름`을 `SITE_NAME`에 넣는다.
2. `node scripts/build-site.mjs` — 이제 `site/public/`에 관리자 페이지와 '글' 영역이 함께 들어가고, `site/firestore.rules`(관리자 이메일이 들어간 규칙)가 생긴다. 출력에 "· 나중에"가 남아 있으면 무엇이 빠졌는지 알린다.
3. **로그인 (교수님이 한 번만)**: "입력창에 아래를 그대로 입력해 주세요. 브라우저가 열리면 ②에서 Firebase를 만든 구글 계정으로 로그인하시면 됩니다"라고 안내한다.
   ```
   ! npx --yes firebase-tools@15.32.1 login
   ```
   (`!`로 시작하면 교수님 터미널에서 직접 실행된다. 처음엔 프로그램을 받느라 1~2분 걸린다. "Allow Firebase to collect CLI usage…?"는 Y/n 아무거나.)
4. **미리보기**: `node --env-file=.env scripts/deploy-site.mjs` → 올릴 파일, 사이트 주소, 관리자 페이지 주소를 보여 준다.
5. **확인 후 올리기**: "`https://<ID>.web.app`으로 사이트를 공개합니다. 진행할까요?"라고 묻고, 확인을 받으면 `node --env-file=.env scripts/deploy-site.mjs --commit`. (사이트와 Firestore 규칙이 함께 올라간다)
   - `[로그인 필요]`가 나오면 3단계를 다시 안내한다.
   - `[Hosting 준비 필요]`가 나오면 콘솔 **빌드 → Hosting → 시작하기**를 눌러 달라고 한 뒤(다음 화면들은 "다음"만 눌러도 된다) 다시 올린다.
6. **확인**: 사이트 주소를 열어 보게 하고, `/knowledge-admin.html`에서 **Google 로그인** → "지식 창고" 탭이 보이면 연결 성공이다. `<ID>.web.app` 도메인은 Firebase가 로그인을 자동으로 허용하므로 승인된 도메인을 따로 추가하지 않아도 된다.
   - "이 계정에는 접근 권한이 없습니다" → 로그인한 계정과 `profile.md`의 `관리자 이메일`이 같은지 본다. 다르면 고치고 `node --env-file=.env scripts/deploy-site.mjs --rules-only --commit`.
7. `profile.md`에 `사이트 주소: https://<ID>.web.app`, `관리자 페이지 보는 곳: 내 사이트`를 적는다. `reports/site-log.md`에 날짜, 주소, 올린 것(사이트·규칙)을 기록한다.
8. **다음 단계 안내**: "이제 지식 자산화를 시작할 수 있습니다. 강의 자료를 `raw/` 폴더에 넣고 `/make`라고 해 주세요. 만들어진 결과물 중 공개하고 싶은 글(칼럼·블로그 등)은 관리자 페이지 결과물 탭에서 **사이트에 게시**를 누르면 사이트의 '글'에 나옵니다." 지식 창고 업로드에 필요한 `npm install --prefix scripts`는 내가 대신 실행한다.

## 다시 올리기 (`/create-site 다시 올리기`, 또는 소개·강의 목록을 바꿀 때)
`site-content.md`·사진·색을 고친 뒤 `node scripts/build-site.mjs` → 미리 보기 → `node --env-file=.env scripts/deploy-site.mjs`(미리보기) → 확인 → `--commit`. 게시한 글은 Firestore에 있으므로 다시 올려도 사라지지 않는다.

## 내 도메인 연결 (선택, 교수님이 원할 때)
Firebase 콘솔 **Hosting → 사용자 지정 도메인 추가** → 화면의 DNS 값을 도메인을 산 곳(가비아·후이즈 등)에 넣는다 (반영에 몇 시간 걸릴 수 있다). 그다음 **Authentication → 설정 → 승인된 도메인**에 그 도메인을 추가해야 관리자 페이지 로그인이 된다. 끝나면 `profile.md`의 `사이트 주소`를 바꾼다.

## 금지
- 교수님 확인 없이 `--commit`으로 사이트를 공개하지 않는다.
- 서비스 계정 키와 `.env`의 내용을 읽거나 채팅에 출력하지 않는다. 키를 채팅에 붙이려 하면 말리고, 이미 붙였다면 그 키를 폐기·재발급하게 한다.
- `site/public`에 `build-site.mjs`가 만들지 않은 파일(자료·초고·키)을 넣지 않는다. `deploy-site.mjs`도 이런 파일이 있으면 올리지 않는다.
- 사이트 내용에 근거 없는 경력·논문·수상, 학생 정보를 쓰지 않는다.
- 게시(사이트의 '글')는 교수님이 관리자 페이지에서 직접 한다. Claude가 결과물을 사이트에 게시하지 않는다.
