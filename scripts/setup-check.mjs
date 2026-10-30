// 세팅이 어디까지 됐는지 점검하고 다음 할 일 하나를 알려준다. (읽기 전용, 비밀 값은 읽지 않는다)
//
//   node scripts/setup-check.mjs           전체 점검표
//   node scripts/setup-check.mjs --brief   짧은 요약 (Claude Code 세션 시작 때 자동 실행)
//
// .env 와 keys/ 는 "있는지"와 파일 이름만 본다. 내용은 읽지 않는다.
// Firebase 콘솔에서 하는 일(규칙 게시, 로그인 켜기, 승인된 도메인)은 확인할 수 없어 "직접 확인"으로 안내한다.

import { readdir, readFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { ROOT, readProfile, viewsOnLocal } from "./profile.mjs";

const exists = async (p) => { try { await access(path.join(ROOT, p)); return true; } catch { return false; } };
const list = async (p) => { try { return await readdir(path.join(ROOT, p)); } catch { return []; } };
const read = async (p) => { try { return await readFile(path.join(ROOT, p), "utf-8"); } catch { return ""; } };

const profile = await readProfile();
const local = viewsOnLocal(profile);
const [major, minor] = process.versions.node.split(".").map(Number);
const nodeOk = major > 20 || (major === 20 && minor >= 6);
const installed = await exists("scripts/node_modules/firebase-admin");
const envOk = await exists(".env");
const keyFiles = (await list("keys")).filter((f) => f.endsWith(".json"));
const adminOk = !/YOUR_[A-Z_]+/.test((await read("admin/index.html")).match(/const firebaseConfig = \{[\s\S]*?\};/)?.[0] ?? "YOUR_");

const repoDir = profile["사이트 저장소 폴더"] || "site-repo";
const adminFile = profile["설치 파일"] || "knowledge-admin.html";
let siteState = "none";
if (await exists(path.join(repoDir, ".git"))) {
  siteState = "cloned";
  const r = spawnSync("git", ["-C", path.join(ROOT, repoDir), "ls-files", `*${adminFile}`], { encoding: "utf-8" });
  if (r.status === 0 && r.stdout.trim()) siteState = "installed";
}

const processed = (await list("processed")).filter((f) => f.endsWith(".json"));
const sources = new Set();
for (const f of processed) { try { sources.add(JSON.parse(await read(`processed/${f}`)).source_file); } catch {} }
// 문서 파일(.pptx 등)은 텍스트로 바뀌면(.meta.json 의 original_file) 그 .txt 로 센다
const rawFiles = await list("raw");
const converted = new Set();
for (const f of rawFiles.filter((f) => f.endsWith(".meta.json"))) {
  try { const m = JSON.parse(await read(`raw/${f}`)); if (m.original_file) converted.add(m.original_file); } catch {}
}
const rawNew = rawFiles.filter((f) => !f.startsWith(".") && !f.endsWith(".meta.json") && !["questions", "hold"].includes(f)
  && !sources.has(f) && !converted.has(f));
const voiceEmpty = (await read("voice.md")).includes("빈 템플릿");
const mapEmpty = (await read("knowledge-map.md")).includes("빈 템플릿");
let drafts = 0;
for (const d of ["lesson", "handout", "quiz", "column", "blog", "script", "book", "weekly"]) drafts += (await list(`drafts/${d}`)).filter((f) => !f.startsWith(".")).length;
const wantsYoutube = /유튜브|영상/.test(profile["운영 채널"] ?? "") || !!profile["유튜브 채널"];
const ytdlp = wantsYoutube && [["yt-dlp"], ["python", "-m", "yt_dlp"], ["python3", "-m", "yt_dlp"], ["py", "-m", "yt_dlp"]]
  .some((c) => spawnSync(c[0], [...c.slice(1), "--version"], { encoding: "utf-8" }).status === 0);

const rawWaiting = rawNew.filter((f) => /\.(txt|md|pptx|docx|hwpx|pdf|srt|vtt)$/i.test(f)).length;

// 순서가 곧 세팅 순서다. 사이트와 Firebase 프로젝트는 이미 있다고 보고 ① 준비 → ② 지식 자산화 → ③ 이 폴더를 Firebase에 연결. todo: 안내할 한 줄, who: 누가 하는가
// /make 는 Firebase 없이도 돌아가므로(로컬 모드) 연결은 초고를 막지 않게 뒤에 둔다
const P = "준비", K = "자산화", C = "연결";
const steps = [
  { group: P, name: "Node.js 20.6 이상", ok: nodeOk, info: `현재 ${process.versions.node}`, who: "사용자", todo: "nodejs.org 에서 LTS 버전을 설치하고 터미널과 Claude를 다시 켠다" },
  { group: P, name: "프로그램 설치 (npm install)", ok: installed, who: "Claude", todo: "`npm install --prefix scripts` 를 대신 실행한다" },
  { group: P, name: "교수 프로필 (이름·전공 분야)", ok: ["이름", "전공 분야"].every((k) => profile[k]), info: profile["이름"] ? `${profile["이름"]} · ${profile["전공 분야"] || "전공 분야 비어 있음"}` : "비어 있음", who: "사용자 답변 → Claude가 기록", todo: "이름과 전공 분야를 묻고 profile.md에 적는다" },
  { group: K, name: "자료 넣기 (raw/)", ok: processed.length > 0 || rawWaiting > 0, info: `지식 창고 ${processed.length}편${rawWaiting ? `, raw/ 에 처리 전 자료 ${rawWaiting}개` : ""}`, who: "사용자", todo: "강의 슬라이드(.pptx)·한글(.hwpx)·워드·PDF·녹취 텍스트를 raw/ 폴더에 넣게 한다. 처음이면 examples/ 연습 강의를 복사해 줘도 된다" },
  { group: K, name: "첫 초고 (/make)", ok: drafts > 0 && !rawWaiting, info: `초고 ${drafts}개${rawWaiting ? ` · 새 자료 ${rawWaiting}개 대기` : ""}`, who: "Claude", todo: "`/make` 를 실행한다 (자료 정리 → 말투·지식 지도 초안 → 자료별 초고 → 검수 → 저장)" },
  { group: C, name: "서비스 계정 키 (이미 만든 Firebase 프로젝트)", ok: keyFiles.length > 0, info: keyFiles.length ? `keys/${keyFiles[0]}` : "keys/ 에 .json 없음", who: "사용자 (Firebase 콘솔)", todo: "프로젝트를 새로 만들지 않는다. 이미 만든 프로젝트의 서비스 계정 키를 keys/service-account.json 으로 넣게 한다 (TUTORIAL.md 3-2단계 5번)" },
  { group: C, name: ".env 설정", ok: envOk, who: "Claude가 파일 복사 → 값은 사용자", todo: "`.env.example` 을 `.env` 로 복사해 주고, FIREBASE_PROJECT_ID 와 키 경로는 사용자가 직접 채우게 한다" },
  { group: C, name: "관리자 페이지 설정 (firebaseConfig)", ok: adminOk, who: "사용자가 값 복사 → Claude가 입력", todo: "이미 만든 Firebase 웹 앱의 firebaseConfig 를 붙여 달라고 해서 admin/index.html 에 넣는다" },
  local
    ? { group: C, name: "관리자 페이지 열기 (내 컴퓨터)", ok: adminOk, info: "`npx serve admin` 후 http://localhost:3000", who: "Claude가 실행", todo: "`npx serve admin` 으로 열어 준다" }
    : siteState !== "none"
      ? { group: C, name: "기존 사이트에 관리자 페이지 올리기", ok: siteState === "installed", info: { cloned: "저장소는 있음, 페이지 미설치", installed: `${repoDir}에 ${adminFile} 있음` }[siteState], who: "Claude (푸시 전 사용자 확인)", todo: "`/site` 를 실행한다. 끝나면 Firebase 승인된 도메인 추가는 사용자가 직접" }
      : { group: C, name: "내 사이트 주소 적기", ok: !!profile["사이트 주소"], info: profile["사이트 주소"] || "", who: "사용자 답변 → Claude가 기록", todo: "이미 있는 사이트 주소를 묻고 profile.md에 적는다. 그 주소의 /knowledge-admin.html 에 로그인되는지 묻고, 페이지가 없으면 `/site` 를 쓴다" },
];
const basis = `기준 파일: voice.md ${voiceEmpty ? "빈 템플릿" : "있음"} · knowledge-map.md ${mapEmpty ? "빈 템플릿" : "있음"} (/make 가 처음 한 번 초안을 만든다)`;
const next = steps.find((s) => !s.ok);
const done = steps.filter((s) => s.ok).length;

if (process.argv.includes("--brief")) {
  console.log(`[세팅 진행 상황: ${done}/${steps.length} 완료 — scripts/setup-check.mjs 가 세션 시작 때 자동 점검]`);
  console.log(steps.map((s) => `${s.ok ? "✓" : "·"} [${s.group}] ${s.name}${s.info ? ` (${s.info})` : ""}`).join("\n"));
  console.log(basis);
  if (wantsYoutube && !ytdlp) console.log("· (선택) 유튜브 강의 가져오기용 yt-dlp 미설치");
  console.log(next
    ? `다음 할 일: ${next.name} — ${next.todo} [${next.who}]\n사용자가 처음 인사하거나 "뭐 해야 해요?"라고 물으면 /start 절차대로 이 '다음 할 일' 하나만 쉽게 안내한다. 사이트와 Firebase는 이미 있다고 보고 안내한다 (아직 없다고 하면 그때 /create-site). "자료로 초고 만들어 줘"면 세팅이 덜 됐어도 /make 를 한다 (Firebase 연결 전이면 로컬 모드).`
    : "세팅 완료. 사용자가 뭘 할지 물으면 raw/ 에 자료를 넣고 /make, 또는 /asset-ideas → /draft 를 권한다.");
} else {
  console.log(`세팅 점검 (${done}/${steps.length} 완료)\n`);
  const titles = { [P]: "■ ① 준비", [K]: "\n■ ② 지식 자산화: 자료 넣고 초고 받기 (/make)", [C]: "\n■ ③ 이 폴더를 이미 만든 Firebase에 연결 (관리자 페이지에서 보기)" };
  for (const g of [P, K, C]) {
    console.log(titles[g]);
    steps.forEach((s, i) => s.group === g && console.log(`${s.ok ? "✅" : "⬜"} ${i + 1}. ${s.name}${s.info ? ` — ${s.info}` : ""}`));
  }
  console.log(`\n${basis}`);
  if (wantsYoutube) console.log(`${ytdlp ? "✅" : "⬜"} (선택) 유튜브 강의 가져오기용 yt-dlp`);
  console.log(next ? `\n👉 다음 할 일: ${next.name}\n   ${next.todo} (${next.who})` : "\n🎉 세팅이 끝났습니다. raw/ 에 자료를 넣고 /make 를 해 보세요.");
  console.log("\n※ Firebase 콘솔에서 하는 일(Firestore·Google 로그인 켜기)은 여기서 확인할 수 없습니다. 관리자 페이지에 로그인해 보면 알 수 있습니다.");
}
