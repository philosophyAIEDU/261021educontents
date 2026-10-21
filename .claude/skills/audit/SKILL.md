---
name: audit
description: 업로드 전후에 CLAUDE.md의 규칙 1~3(키 유출 금지, 댓글 작성자 정보 금지, 타인·유료 콘텐츠 금지)을 어겼는지 점검할 때 쓴다. "보안 점검해줘", "규칙 위반 없는지 확인해줘", "올리기 전에 점검", "git에 올려도 돼?"라고 하면 실행한다. 읽기만 하고 아무것도 수정하거나 올리지 않는다.
---

# /audit — 규칙 1~3 점검 (읽기 전용)

작업 폴더: 이 프로젝트 폴더(저장소를 내려받은 폴더). 결과는 항목별 통과/문제로 표로 보고한다. **수정은 하지 않고** 문제와 권장 조치만 알린다.

## 규칙 1 — 키가 git에 올라가지 않는가
- `.gitignore`에 `.env`, `.env.*`, `*firebase-adminsdk*.json`, `serviceAccount*.json`, `keys/`, `raw/*`, `site-repo/`가 모두 있는지 확인한다.
- git 저장소이면 `git ls-files`로 키·`.env` 파일이 추적되고 있지 않은지, `git log --all --diff-filter=A --name-only`로 과거에 추가된 적이 없는지 확인한다. 저장소가 아니면 "아직 git 저장소가 아님"이라고 알린다.
- `scripts/`, `processed/`, `reports/`, `CLAUDE.md`, `brand.md`에서 키 형태 문자열(`AIza`로 시작하는 39자, `-----BEGIN PRIVATE KEY-----`, `"private_key"`)을 검색한다. 검색 결과에는 **값 자체를 출력하지 말고** 파일과 줄 번호만 보고한다.
- `.env`와 `keys/`의 **내용은 읽지 않는다.** 파일이 존재하는지, 이름이 `.gitignore`에 걸리는지만 본다.
- 참고: Firebase 웹 설정의 `apiKey`(AIza…)는 브라우저용 공개 값이라 문제가 아니다. 서비스 계정 키·YouTube API 키·`private_key`는 문제다.

## 규칙 2 — 댓글에 작성자 정보가 없는가
- `processed/`에서 `format`이 `댓글`인 문서를 모두 열어 확인한다.
  - 최상위·`tags`에 `author`, `author_name`, `nickname`, `username`, `user_id`, `profile`, `profile_url`, `avatar` 같은 필드가 없는지.
  - `body`와 `key_message`에 `@멘션`, 이메일, 전화번호, 프로필 링크, `youtube.com/channel`, `youtube.com/@`가 없는지.
- `raw/comments/`는 원본이므로 검사 대상이 아니다.
- `reports/`(특히 `ingest-log.md`)에 댓글 작성자로 보이는 이름이 적혀 있지 않은지 훑어본다.

## 규칙 3 — 타인·유료 콘텐츠가 없는가
- `youtube_url`이 있는 문서는 내 채널(`brand.md`의 `유튜브 채널`) 영상인지 확인한다. `scripts/extract.mjs`로 가져온 영상은 가져올 때 채널을 확인했다. 그 밖의 영상은 `.env`에 `YOUTUBE_API_KEY`가 있으면 `videos?part=snippet&id=<id>`로 채널을 조회해 비교하고, 없으면 "사용자 확인 필요"로 표시한다.
- `source_url`이 있는 문서는 주소가 `brand.md`의 내 주소(사이트·RSS·내 다른 주소)에 속하는지 확인한다 (`node scripts/brand.mjs`로 목록을 본다).
- `site-repo/`가 있으면 `git -C site-repo status --short`와 최근 커밋에 관리자 페이지 파일 말고 이 프로젝트의 파일(`processed/`, `drafts/`, `.env`, `keys/`)이 들어가지 않았는지 확인한다.
- 뉴스레터·스레드 본문에 타인의 글을 통째로 인용한 흔적, 유료 결제 안내·"멤버십 전용" 문구가 없는지 훑어본다.
- 확정할 수 없으면 "사용자 확인 필요"로 표시한다.

## 태그 점검
- `processed/*.json`마다 필수 태그 6개가 채워져 있는지, `performance_grade`가 상/중/하인지, `published_at`이 `YYYY-MM-DD`인지 확인한다 (비어 있으면 `missing_tags`와 함께 나열).

## 보고 형식
`통과 / 문제 / 확인 필요`로 나눈 표와, 문제별 권장 조치(예: "키 폐기 후 재발급", "해당 문서를 /takedown으로 삭제")를 준다. 조치를 대신 실행하지 않는다.
