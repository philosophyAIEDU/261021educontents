---
name: ingest
description: 내 콘텐츠(유튜브 대본, 뉴스레터, 스레드, 블로그 글)를 가져와 정리·태깅한 뒤 Firebase Contents Input에 올린다. raw/에 넣은 파일은 물론, 유튜브 영상·채널 링크, 내 사이트 글 주소, RSS 주소, 내 사이트 저장소에서 직접 가져온다. "새 파일 올려줘", "raw에 넣었어", "/ingest https://youtu.be/...", "/ingest 내 블로그 글 가져와"처럼 말하면 실행한다. "/ingest auto"는 질문 없이 처리하고 애매한 파일은 raw/hold/로 보류한다. 댓글은 /ingest-comments를 쓴다.
---

# /ingest — 내 콘텐츠 가져오기 → 정리·태깅 → Contents Input 업로드

작업 폴더: 이 프로젝트 폴더. 반드시 `CLAUDE.md`의 필수 태그·규칙 1~3을 따른다.

## 실행 모드
- `/ingest` (기본): 애매한 것은 묻고, 태그 표를 확인받은 뒤 올린다.
- `/ingest auto` (자동): 질문하지 않는다. 아래 "자동 모드"가 확인·질문 단계를 대신한다. `/auto`가 이 모드를 쓴다.
- 인자에 링크가 있으면 0단계에서 먼저 가져온다.

## 0. 가져오기 (raw/에 원본 만들기)
인자·요청에 따라 `scripts/extract.mjs`로 `raw/`에 `.txt`와 `.txt.meta.json`(제목, 발행일, 조회수, 원본 주소)을 만든다. 스크립트는 **brand.md에 적힌 내 주소의 콘텐츠만** 가져오고(규칙 3), 이미 가져온 것은 건너뛴다.

| 사용자가 준 것 | 명령 |
|---|---|
| 유튜브 영상 링크 | `node scripts/extract.mjs --youtube <링크>` |
| 내 유튜브 채널 링크 ("최근 영상 가져와") | `node scripts/extract.mjs --youtube <채널 링크> --limit 5` |
| 내 사이트·블로그 글 주소 | `node scripts/extract.mjs --url <주소>` |
| RSS 주소 ("블로그/뉴스레터 글 가져와") | `node scripts/extract.mjs --rss <RSS 주소> --limit 10` |
| "내 사이트 글 전부" (저장소에 마크다운 글이 있을 때) | `node scripts/extract.mjs --repo site-repo --limit 20` |
| brand.md에 적힌 곳 모두 | `node scripts/extract.mjs --auto` |

- 여러 개를 가져올 때는 먼저 `--list`를 붙여 목록을 보여 주고 확인받는다 (자동 모드는 생략).
- `내 주소가 아닙니다`: 사용자 본인 글인지 묻는다. 맞다면 그 도메인을 brand.md `내 다른 주소`에 추가하고 다시 실행한다. 타인의 글이면 멈춘다.
- `yt-dlp 가 없습니다`: 오류 문구의 설치 방법을 안내한다. 설치가 어려우면 유튜브 스튜디오 > 자막 > 다운로드(.srt)로 받은 파일을 `raw/`에 넣게 한다.
- `본문이 매우 짧습니다`: 자막이 없거나, 글이 화면에서만 그려지는 사이트다. 사이트 저장소(`--repo`)나 파일 복사를 제안한다.
- 사용자가 파일을 직접 넣은 경우(`.txt`, `.md`, `.srt`, `.vtt`)는 이 단계를 건너뛴다.

## 1. 대상 찾기와 종류 판별
- 대상: `raw/` 최상위 파일 중 `processed/*.json`의 `source_file`에 없는 것. 제외: `raw/hold/`, `raw/comments/`(댓글은 `/ingest-comments`), `*.meta.json`, `.gitkeep`.
- 종류(`.meta.json`의 `format_hint`가 있으면 우선 참고):
  - **유튜브 대본**: 말하는 문체, 영상 인사·마무리 → id `script-NN`
  - **뉴스레터**: 인사말 / 본문 / 나의 생각 / 다음 예고 구성 → id `newsletter-NN`
  - **스레드**: 짧은 글 여러 개가 이어진 SNS 글 → id `thread-NN`
  - **블로그 글**: 사이트에 올린 글 → id `post-NN`
- 애매하면 추측하지 말고 묻는다. 타인의 글·유료 콘텐츠로 보이면 멈추고 확인한다 (규칙 3).

## 2. 정제
- `raw/`는 절대 수정하지 않는다. 정제본은 `processed/<id>.json`에만 만든다. id 번호는 같은 종류의 기존 최대 번호 + 1.
- 빈 줄·자리표시 문구 제거. 자막 파일(`.srt`, `.vtt`)은 번호·시간 표시를 지우고 말한 내용만 남긴다.
- 자동 자막: `.claude/skills/fix-transcript/glossary.md`를 읽고 **확실한** 용어 오인식만 고친다. 확정할 수 없는 곳은 그대로 두고 목록으로 보고한다.

## 3. 태깅 (표로 먼저 보여 주고 확인받기)
필수 태그 6개: `category`, `format`, `target_audience`, `performance_grade`, `published_at`, `key_message`.
- `category`·`target_audience`: `taxonomy.md`의 목록 → 기존 `processed/`의 값 → brand.md의 `주로 다루는 주제`·`주요 타깃` 순서로 고른다. 애매하면 **제안**이라고 표시하고 묻는다.
- `published_at`·조회수: `.meta.json`에 있으면 쓴다. 조회수가 있으면 `CLAUDE.md`의 성과등급 기준으로 `performance_grade`를 계산한다.
- 조회수가 없는 뉴스레터·스레드·블로그 글의 등급: brand.md `성과 수치가 없는 글의 등급`에 값이 있으면 그 값을 쓰고 문서에 `"grade_source": "brand.md 기본값"`을 남긴다. 비어 있으면 사용자에게 묻는다. 발행일도 없으면 묻는다. 모르면 `null`로 두고 그 상태로는 올리지 않는다 (사용자가 명시적으로 허용할 때만 `--allow-missing <태그>`).
- **표를 보여 주고 확인받기 전에는 `processed/`에 저장하지 않는다.** 여러 편이면 표 하나에 모아 한 번에 확인받는다.

## 4. 저장과 업로드
1. `processed/<id>.json` 저장. 구조: `id`, `title`, `source_file`, (있으면) `source_url`·`youtube_url`·`youtube_id`·`repo_path`, `tags{6개}`, `views`, `views_fetched_at`, `upload_ready`, `missing_tags`, `body`.
2. 미리 검사: `node scripts/upload.mjs --id <id>` (필수 태그, 중복, 개인정보 패턴). 실패하면 이유를 알리고 멈춘다.
3. **검수 에이전트 (필수)**: `--commit` 전에 `data-checker` 에이전트(`subagent_type: "data-checker"`)를 부른다. 프롬프트에 id 목록과 허용한 누락 태그를 적는다.
   - `판정: 업로드 중단` → 올리지 않는다. 문제와 고칠 방법을 한글로 전한다. 중복·개인정보 문제는 사용자가 "그냥 올려"라고 해도 고친 뒤 다시 검수한다.
   - `확인 필요` 항목, `덮어쓰기 예정` 문서는 사용자에게 알리고 답을 받는다.
4. 확인이 나면 업로드: `node --env-file=.env scripts/upload.mjs --id <id> --commit` (Firestore와도 다시 비교하고, 문제가 있으면 아무것도 쓰지 않는다. `.env`·`keys/` 내용은 읽지 않는다).

## 5. 기록
`reports/ingest-log.md` 맨 아래에 날짜, id, 원본(파일·주소), 종류, 태그 요약, 용어 교정 수/미수정 목록, 검수 결과, 업로드 결과, 비어 있는 태그를 추가한다. 끝나면 "관리자 페이지 Contents Input 탭에서 확인할 수 있다"고 알린다.

## 자동 모드 (`/ingest auto`)
**원칙: 묻지 않는다. 확신할 수 없으면 올리지 않고 보류한다.** 잘못 올리는 것보다 보류가 낫다.

1. 인자에 링크가 있으면 0단계로 가져온다 (`--list` 생략). 가져오기 실패는 로그에 남기고 계속한다.
2. 대상 파일마다 **독립적으로** 1~4단계를 하되 표 확인은 생략한다. 하나가 실패해도 다음 파일로 간다.
3. 다음 중 하나라도 해당하면 **보류**한다.
   - 종류가 명확하지 않다.
   - `category`·`target_audience`가 `taxonomy.md`나 기존 `processed/` 값 중 명확히 맞는 것이 없다 (자동 모드는 새 값을 만들지 않는다. 단 `processed/`가 비어 있으면 brand.md의 주제·타깃을 그대로 쓴다).
   - `published_at`을 채울 수 없거나, 조회수가 없는데 brand.md `성과 수치가 없는 글의 등급`도 비어 있다.
   - `key_message`를 한 문장으로 정하기 어렵다.
   - 타인의 글·유료 콘텐츠 의심 (규칙 3).
   - 미리 검사 실패, `data-checker`의 `업로드 중단`, `확인 필요` 항목, `덮어쓰기 예정` 문서.
   - `--allow-missing`은 쓰지 않는다.
4. 통과하면 `--commit`으로 올린다. 명령이 오류(네트워크·권한)로 끝나면 **실패**로 기록하고, 이번에 만든 `processed/<id>.json`은 지워 다음에 다시 시도되게 한다 (업로드 여부가 불확실하면 지우지 말고 "업로드 여부 불확실"이라고 적는다).
5. **보류 처리**: 원본과 `.meta.json`을 `raw/hold/`로 옮기고(`mkdir -p raw/hold`, 내용 수정 없음, 같은 이름이 있으면 `-2`), 옆에 `<파일명>.hold.txt`로 **보류 사유와 사람이 결정할 것**을 한글로 적는다. 저장했던 `processed/<id>.json`은 `processed/_hold/`로 옮긴다. 보류 파일은 다음 자동 실행에서 다시 처리되지 않는다 (사람이 해결한 뒤 `raw/`로 되돌리거나 `/ingest`로 처리).
6. **기록**: `reports/ingest-log.md`에 `## YYYY-MM-DD /ingest auto` → `### 실행 HH:MM` 아래 표로 남긴다 (날짜·시각은 `date`로 얻는다).
   ```
   | 파일 | 결과 | id | 사유·요약 |
   |---|---|---|---|
   | yt-abc123.txt | 업로드 성공 | script-06 | 활용법 / 상(3,210회) / 발행 2026-09-20 |
   | web-my-post.txt | 보류 | - | 성과등급을 채울 수 없음 → raw/hold/ |
   ```
   결과는 **업로드 성공 / 보류 / 실패** 중 하나. 개인정보는 값이 아니라 종류와 위치만 쓴다. 마지막 줄: `합계: 성공 N · 보류 N · 실패 N`.
7. **보고**: 건수, 파일별 한 줄, 보류 사유와 사람이 할 일. 질문으로 끝내지 않는다.

## 금지
- `.env`, `keys/`의 내용을 읽거나 출력하지 않는다.
- 필수 태그가 빈 채로 조용히 올리지 않는다. 기본 모드에서 사용자 확인 없이 `--commit` 하지 않는다.
- 자동 모드에서 삭제, 기존 문서 덮어쓰기, `--allow-missing`, 새 카테고리 생성, 검수 건너뛰기를 하지 않는다.
