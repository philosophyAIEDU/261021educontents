---
name: audit
description: 업로드 전후에 CLAUDE.md의 규칙 1~3(키 유출 금지, 학생 신원 정보 금지, 타인 저작물·유료 자료 금지)을 어겼는지 점검할 때 쓴다. "보안 점검해줘", "학생 정보 남은 거 없는지 봐줘", "규칙 위반 없는지 확인해줘", "올리기 전에 점검", "git에 올려도 돼?"라고 하면 실행한다. 읽기만 하고 아무것도 수정하거나 올리지 않는다.
---

# /audit — 규칙 1~3 점검 (읽기 전용)

작업 폴더: 이 프로젝트 폴더. 결과는 항목별 통과/문제로 표로 보고한다. **수정은 하지 않고** 문제와 권장 조치만 알린다.

## 규칙 1 — 키가 git에 올라가지 않는가
- `.gitignore`에 `.env`, `.env.*`, `*firebase-adminsdk*.json`, `serviceAccount*.json`, `keys/`, `raw/*`, `processed/*`, `site-repo/`가 모두 있는지 확인한다.
- git 저장소이면 `git ls-files`로 키·`.env` 파일이 추적되고 있지 않은지, `git log --all --diff-filter=A --name-only`로 과거에 추가된 적이 없는지 확인한다. 저장소가 아니면 "아직 git 저장소가 아님"이라고 알린다.
- `scripts/`, `processed/`, `reports/`, `CLAUDE.md`, `profile.md`에서 키 형태 문자열(`AIza`로 시작하는 39자, `-----BEGIN PRIVATE KEY-----`, `"private_key"`)을 검색한다. 검색 결과에는 **값 자체를 출력하지 말고** 파일과 줄 번호만 보고한다.
- `.env`와 `keys/`의 **내용은 읽지 않는다.** 파일이 존재하는지, 이름이 `.gitignore`에 걸리는지만 본다.
- 참고: Firebase 웹 설정의 `apiKey`(AIza…)는 브라우저용 공개 값이라 문제가 아니다. 서비스 계정 키·YouTube API 키·`private_key`는 문제다.

## 규칙 2 — 학생 신원 정보가 없는가
- `processed/`의 모든 문서를 `node scripts/precheck.mjs --id <id들>`로 검사하고, 경고(⚠)의 "사람 이름으로 보일 수 있는 표현", "학번으로 보일 수 있는 숫자", "성적·점수 표현"을 문맥을 읽어 가린다.
- `format`이 `학생 질문`인 문서는 직접 열어 확인한다.
  - 최상위·`tags`에 `name`, `student_id`, `email`, `author`, `nickname`, `profile` 같은 필드가 없는지.
  - `body`와 `key_message`에 이름, 학번, `@멘션`, 이메일, 전화번호, 프로필 링크, 개인 사정이 없는지.
- `format`이 `강의 녹취`인 문서에서 "○○ 학생", "○○ 씨" 같은 호명이 남아 있지 않은지 `Grep`으로 찾는다.
- `knowledge-map.md`, `structure.md` 9절, `reports/`(특히 `ingest-log.md`), `drafts/`에 학생 이름이나 질문 원문이 옮겨져 있지 않은지 훑어본다.
- `raw/questions/`는 원본이므로 검사 대상이 아니다 (git에 올라가지 않는지만 본다).

## 규칙 3 — 타인 저작물·유료 자료가 없는가
- `youtube_url`이 있는 문서는 내 채널(`profile.md`의 `유튜브 채널`) 영상인지 확인한다. `scripts/extract.mjs`로 가져온 영상은 가져올 때 채널을 확인했다. 그 밖의 영상은 `.env`에 `YOUTUBE_API_KEY`가 있으면 `videos?part=snippet&id=<id>`로 채널을 조회해 비교하고, 없으면 "사용자 확인 필요"로 표시한다.
- `source_url`이 있는 문서는 주소가 `profile.md`의 내 주소(사이트·RSS·내 다른 주소)에 속하는지 확인한다 (`node scripts/profile.mjs`로 목록을 본다).
- `format`이 `논문·연구`인 문서: 본문이 출판본 전문으로 보이는지(학술지 판권 문구, 쪽 머리말 반복), `coauthors_note`가 필요한 공저인지 본다. 해당하면 "저작권·공저자 확인 필요"로 표시한다.
- `강의자료` 문서에 타 저자 교재·슬라이드를 길게 옮긴 흔적이 없는지 훑어본다.
- `site-repo/`가 있으면 `git -C site-repo status --short`와 최근 커밋에 관리자 페이지 파일 말고 이 프로젝트의 파일(`processed/`, `drafts/`, `.env`, `keys/`)이 들어가지 않았는지 확인한다.
- 확정할 수 없으면 "사용자 확인 필요"로 표시한다.

## 태그 점검
- `processed/*.json`마다 필수 태그 6개가 채워져 있는지, `format`·`knowledge_type`이 정해진 값인지, `created_at`이 `YYYY-MM-DD`인지, `reception_grade`가 있으면 상/중/하인지 확인한다 (비어 있으면 `missing_tags`와 함께 나열).

## 보고 형식
`통과 / 문제 / 확인 필요`로 나눈 표와, 문제별 권장 조치(예: "키 폐기 후 재발급", "해당 문서를 /takedown으로 삭제 후 학생 이름을 지우고 다시 /ingest")를 준다. 조치를 대신 실행하지 않는다. 학생 정보를 보고할 때 실제 값을 옮기지 않고 위치와 종류만 적는다.
