---
name: feedback
description: 성과를 기록한다. (1) 이미 올라간 콘텐츠의 조회수가 바뀌었을 때 성과등급(상/중/하)을 다시 계산해 processed/와 Firebase에 반영하고, (2) 초고로 발행한 지 7~14일 뒤 얼마나 고쳤는지와 성과 수치를 Contents Output에 기록한다. "조회수 갱신해줘", "script-03 조회수 25000", "발행했는데 성과 넣을게", "/feedback"처럼 쓴다.
---

# /feedback — 성과 기록 (조회수·등급 갱신 + 발행 후 기록)

작업 폴더: 이 프로젝트 폴더. **대화형**이다. 필요한 것만 짧게 묻는다. 요청을 보고 A 또는 B를 고른다 (애매하면 묻는다).

## 등급 기준
`CLAUDE.md`의 "성과등급 기준"을 따른다 (기본: 조회수 100 미만 하 / 100 이상 1000 미만 중 / 1000 이상 상).
**기준이 없는 지표(시청 지속률, 저장 수, 클릭률 등)로 등급을 만들지 않는다.** 그런 지표를 등급에 쓰려면 먼저 "몇 이상이 상인가요?"를 묻고, 답을 받으면 `CLAUDE.md`에 적는다. 기준이 없으면 수치만 기록한다.

## A. 조회수·등급 갱신
1. **대상 찾기**: 준 id나 제목을 `processed/*.json`(`title`, `source_file`, `key_message`)에서 찾는다. 여러 개면 고르게 하고, 없으면 `/ingest`가 먼저라고 알린다. "전체 갱신"이면 `youtube_url`이 있는 문서 전부.
2. **수치 얻기**: 사용자가 준 값을 우선 쓴다. 없고 `youtube_url`이 있으면 `.env`에 `YOUTUBE_API_KEY`가 있을 때 `node --env-file=.env scripts/enrich.mjs --id <id>`(전체는 `--all`)로 가져온다. 키가 없으면 유튜브 스튜디오의 조회수를 알려 달라고 한다.
3. **변경 표**: id, 제목, 이전 → 새 조회수·등급을 보여 주고 확인받는다. 확인 전에는 저장하지 않는다.
4. **저장·업로드**: `processed/<id>.json`의 `views`, `views_fetched_at`, `tags.performance_grade`(지표 기록은 `retention_percent` 등)만 고친다 → `node scripts/upload.mjs --id <id>`로 미리 검사 → 확인 후 `node --env-file=.env scripts/upload.mjs --id <id> --commit`.
5. 댓글 문서(`parent_id`가 같은 것)의 등급은 부모를 따른다. 부모 등급이 바뀌면 함께 바꿀지 묻는다.
6. `reports/ingest-log.md`에 날짜, id, 이전→이후, 수치 출처(사용자/API), 업로드 결과를 적는다.

## B. 발행 후 기록 (발행 7~14일 뒤)
초고를 만들고 끝나면 엔진이 자라지 않는다. "실제로 얼마나 고쳤는지"와 성과를 다시 넣어야 `voice.md`·`structure.md`를 고칠 근거가 생긴다.
1. **어떤 초고인가**: `drafts/`의 최근 초고를 보여 주고 고르게 한다 (초고 없이 쓴 글이면 "초고 없음").
2. **발행 정보**: 발행일, 링크. 7일 미만이면 "데이터가 덜 쌓였다"고 알리고 계속할지 묻는다.
3. **얼마나 고쳤나**: 거의 그대로(20% 이하) / 일부(20~50%) / 대폭(50% 초과) / 새로 씀. 발행본 텍스트를 주면 초고와 비교해 대략의 수정 비율을 계산한다 (대략치라고 밝힌다). 많이 고쳤으면 어디를 왜 고쳤는지 1~3가지 묻는다.
4. **성과 수치**: 채널별 핵심 지표 하나만 받는다. `CLAUDE.md`에 합의된 지표가 없으면 제안(스레드 저장 수 / 뉴스레터 클릭률 / 유튜브 조회수 / 블로그 방문 수)을 보여 주고 고르게 한 뒤 `CLAUDE.md`에 적는다.
5. **저장**: `reports/feedback/<날짜>_<슬러그>.json`으로 저장하고 `node scripts/save-output.mjs --file <경로>` → 통과하면 `node --env-file=.env scripts/save-output.mjs --file <경로> --commit`. 관리자 페이지 Contents Output에 "성과 피드백"으로 보인다.
```
{ "title": "[성과] 스레드 · <주제>", "type": "성과 피드백",
  "sourceIds": ["<관련 processed id가 있으면>"],
  "body": "발행일, 수정 정도, 지표와 수치, 메모를 읽기 쉽게 요약",
  "meta": { "channel": "thread", "draft_file": "drafts/thread/...", "published_at": "YYYY-MM-DD",
            "edit_level": "일부 수정", "edit_ratio_estimate": 0.3,
            "metric": "저장 수", "value": 42, "grade": "상|중|하|null", "days_after_publish": 10 } }
```
6. **발행본을 Input에도**: 발행한 글·영상을 아직 올리지 않았다면 `/ingest <링크>`를 권한다 (다음 분석의 재료가 된다).
7. **규칙으로 남길 피드백**: 3에서 나온 수정 이유 중 앞으로도 적용할 것은 `reports/monthly/inbox.md`에 날짜와 함께 한 줄씩 추가한다. `voice.md`·`structure.md`는 여기서 고치지 않는다 (월간 리뷰에서 사용자가 승인한다).

## 금지
- 수치를 지어내거나 추정해서 채우지 않는다. 모르면 비운다.
- 기준 없는 지표로 등급을 매기지 않는다. 사용자 확인 없이 `--commit` 하지 않는다.
- `.env`, `keys/`의 내용을 읽거나 출력하지 않는다.
