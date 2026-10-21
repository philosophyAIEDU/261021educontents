# 콘텐츠 스튜디오 스타터

내 콘텐츠를 모으고, 다음 콘텐츠 아이디어를 받고, 내 말투로 초고까지 만들어 주는 **Claude Code 작업 폴더**입니다. 유튜브·뉴스레터·스레드·블로그를 하는 크리에이터를 위해 만들었습니다. 결과는 **내 사이트에 올린 관리자 페이지**에서 봅니다.

```
① 모으기 (Input)   유튜브·내 사이트·RSS 링크만 주면 대본과 글을 가져와 정리해 올린다   /ingest
② 분석             내 말투와 잘 된 콘텐츠의 패턴을 찾는다                             /analyze-style
③ 아이디어         모아 둔 콘텐츠를 근거로 다음 주제 5개를 제안한다                    /topic-ideas
④ 초고 (Output)    주제 한 줄로 초고를 쓰고, 검수한 뒤 자동으로 보관한다               /draft
⑤ 확인             내 사이트/contents-admin.html 에서 Input과 Output을 본다             /site
   자동            ①~④를 질문 없이 한 번에, 매주 예약 실행도 가능                     /auto
```

초고는 완성본이 아니라 **"20% 고칠 게 남은 초고"** 입니다. 마지막 손질과 발행은 언제나 내가 합니다.

## 시작하기 (명령 3줄)

```
git clone https://github.com/philosophyAIEDU/260927contents.git my-contents
cd my-contents
claude
```
Claude가 켜지면 **"뭐부터 해야 해요?"** 라고 물어보거나 **`/start`** 라고 입력하세요. Claude가 세팅이 어디까지 됐는지 자동으로 점검해 두었다가 다음 할 일을 하나씩 알려 줍니다. 지금 해야 할 일을 하나씩 안내하고, 내 브랜드·사이트 주소·GitHub 저장소를 물어 설정합니다. 자세한 설명은 **[TUTORIAL.md](TUTORIAL.md)**.

준비물: [Claude Code](https://claude.com/claude-code), [Node.js](https://nodejs.org) 20.6 이상, 구글 계정(Firebase 무료 플랜), 내 사이트와 그 GitHub 저장소. 유튜브 영상을 가져오려면 [yt-dlp](https://github.com/yt-dlp/yt-dlp).

## 명령어는 7개면 충분합니다

| 명령어 | 하는 일 |
|---|---|
| `/start` | 지금 몇 단계인지 보고 다음 할 일 하나를 알려 준다. 브랜드 설정 |
| `/site` | 관리자 페이지를 내 사이트 GitHub 저장소에 넣고 올린다 |
| `/ingest <링크>` | 내 유튜브 영상·채널, 사이트 글, RSS에서 가져와 Input에 올린다 |
| `/analyze-style` | 내 말투(`voice.md`)와 잘 된 패턴(`structure.md`)을 채운다 |
| `/topic-ideas` | 다음 주제 후보 5개 |
| `/draft <채널> <주제>` | 초고 → 자동 검수 → Output 저장 (스레드·뉴스레터·대본·블로그) |
| `/auto` | 가져오기부터 초고·Output 저장까지 한 번에 |

그 밖의 명령(`/feedback`, `/monthly-review`, `/audit` 등)은 `/menu`에서 볼 수 있습니다.

## 이런 점이 다릅니다
- **링크만 주면 됩니다.** 유튜브 자막, 내 블로그 글, RSS, 내 사이트 저장소의 글을 가져옵니다. `brand.md`에 적은 **내 주소의 콘텐츠만** 가져옵니다.
- **내 사이트에서 봅니다.** 관리자 페이지 파일 하나를 내 사이트에 넣습니다. 데이터는 Firebase에 있고 내 구글 계정으로 로그인해야만 보입니다.
- **내 말투로 씁니다.** `voice.md`(말투)와 `structure.md`(잘 된 패턴)를 내 콘텐츠에서 뽑아 초고의 기준으로 씁니다.
- **지어내지 않습니다.** 수치는 내가 올린 자료에 있는 것만 쓰고, 없으면 "확인 필요"로 표시합니다.
- **자동으로 검수합니다.** 올리기 전에는 필수 태그·중복·개인정보를, 초고는 말투와 과장·개인 노출을 따로 검수합니다.

## 폴더 안내

| 폴더·파일 | 역할 |
|---|---|
| `brand.md` | 내 브랜드와 주소 (사이트, GitHub 저장소, 유튜브, RSS). `/start`가 채움 |
| `raw/` | 가져온 원본 (수정하지 않고, git에 올라가지 않음) |
| `processed/` | 정리·태깅된 콘텐츠 (Input에 올라가는 JSON) |
| `drafts/` | 초고 (`thread/`, `newsletter/`, `script/`, `blog/`, `weekly/`) |
| `voice.md`, `structure.md` | 내 말투, 잘 된 패턴 (`/analyze-style`이 채움) |
| `admin/index.html` | 관리자 페이지 원본 (`/site`가 내 사이트에 `contents-admin.html`로 넣음) |
| `scripts/` | 가져오기·업로드·검수·사이트 설치 스크립트 (Claude가 알아서 실행) |
| `reports/` | 작업 기록 |
| `firestore.rules` | Firebase 보안 규칙 (나만 읽고 쓰게) |
| `.claude/` | Claude Code용 명령어(스킬), 검수 에이전트, 권한 설정 |
| `CLAUDE.md`, `GUIDE_FOR_CLAUDE.md` | Claude가 매번 읽는 규칙과 안내 방법 |
| `examples/` | 연습용 예시 대본 |

## 꼭 지켜 주세요
- **서비스 계정 키(`keys/`)와 `.env`는 절대 GitHub에 올리지 마세요.** `.gitignore`가 막아 주지만, 그 설정을 지우지 마세요.
- 내 콘텐츠를 넣은 뒤 이 폴더를 GitHub에 올린다면 **private 저장소**로 두세요 (`voice.md`에 내 문장이 들어갑니다). 내 **사이트** 저장소에는 관리자 페이지 파일 하나만 들어갑니다.
- 내가 직접 만든 콘텐츠만 넣으세요. 타인의 글이나 유료 콘텐츠는 넣지 않습니다.

## 라이선스
MIT License. 자유롭게 쓰고 고쳐도 됩니다.
