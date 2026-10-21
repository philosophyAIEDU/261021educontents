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
import { ROOT, readBrand } from "./brand.mjs";

const exists = async (p) => { try { await access(path.join(ROOT, p)); return true; } catch { return false; } };
const list = async (p) => { try { return await readdir(path.join(ROOT, p)); } catch { return []; } };
const read = async (p) => { try { return await readFile(path.join(ROOT, p), "utf-8"); } catch { return ""; } };

const brand = await readBrand();
const [major, minor] = process.versions.node.split(".").map(Number);
const nodeOk = major > 20 || (major === 20 && minor >= 6);
const installed = await exists("scripts/node_modules/firebase-admin");
const brandMissing = ["브랜드 이름", "사이트 주소", "사이트 GitHub 저장소"].filter((k) => !brand[k]);
const envOk = await exists(".env");
const keyFiles = (await list("keys")).filter((f) => f.endsWith(".json"));
const adminOk = !/YOUR_[A-Z_]+/.test((await read("admin/index.html")).match(/const firebaseConfig = \{[\s\S]*?\};/)?.[0] ?? "YOUR_");

const repoDir = brand["사이트 저장소 폴더"] || "site-repo";
const adminFile = brand["설치 파일"] || "contents-admin.html";
let siteState = "none";
if (await exists(path.join(repoDir, ".git"))) {
  siteState = "cloned";
  const r = spawnSync("git", ["-C", path.join(ROOT, repoDir), "ls-files", `*${adminFile}`], { encoding: "utf-8" });
  if (r.status === 0 && r.stdout.trim()) siteState = "installed";
}

const processed = (await list("processed")).filter((f) => f.endsWith(".json"));
const sources = new Set();
for (const f of processed) { try { sources.add(JSON.parse(await read(`processed/${f}`)).source_file); } catch {} }
const rawNew = (await list("raw")).filter((f) => !f.startsWith(".") && !f.endsWith(".meta.json") && !["comments", "hold"].includes(f) && !sources.has(f));
const voiceEmpty = (await read("voice.md")).includes("빈 템플릿");
let drafts = 0;
for (const d of ["thread", "newsletter", "script", "blog", "weekly"]) drafts += (await list(`drafts/${d}`)).filter((f) => !f.startsWith(".")).length;
const wantsYoutube = /유튜브/.test(brand["운영 채널"] ?? "") || !!brand["유튜브 채널"];
const ytdlp = wantsYoutube && [["yt-dlp"], ["python", "-m", "yt_dlp"], ["python3", "-m", "yt_dlp"], ["py", "-m", "yt_dlp"]]
  .some((c) => spawnSync(c[0], [...c.slice(1), "--version"], { encoding: "utf-8" }).status === 0);

// 순서가 곧 세팅 순서다. todo: 사용자에게 안내할 한 줄, who: 누가 하는가
const steps = [
  { name: "Node.js 20.6 이상", ok: nodeOk, info: `현재 ${process.versions.node}`, who: "사용자", todo: "nodejs.org 에서 LTS 버전을 설치하고 터미널과 Claude를 다시 켠다" },
  { name: "프로그램 설치 (npm install)", ok: installed, who: "Claude", todo: "`npm install --prefix scripts` 를 대신 실행한다" },
  { name: "브랜드 정보 (brand.md)", ok: !brandMissing.length, info: brandMissing.length ? `비어 있음: ${brandMissing.join(", ")}` : brand["브랜드 이름"], who: "사용자 답변 → Claude가 기록", todo: "`/start` 3절처럼 한두 가지씩 묻고 brand.md에 적는다" },
  { name: "Firebase 프로젝트·서비스 계정 키", ok: keyFiles.length > 0, info: keyFiles.length ? `keys/${keyFiles[0]}` : "keys/ 에 .json 없음", who: "사용자 (Firebase 콘솔)", todo: "TUTORIAL.md 3단계를 한 화면씩 안내한다 (프로젝트 → Firestore → 규칙 게시 → Google 로그인 → 키 받기)" },
  { name: ".env 설정", ok: envOk, who: "Claude가 파일 복사 → 값은 사용자", todo: "`.env.example` 을 `.env` 로 복사해 주고, FIREBASE_PROJECT_ID 와 키 경로는 사용자가 직접 채우게 한다" },
  { name: "관리자 페이지 설정 (firebaseConfig)", ok: adminOk, who: "사용자가 값 복사 → Claude가 입력", todo: "Firebase 웹 앱을 등록하고 firebaseConfig 를 붙여 달라고 해서 admin/index.html 에 넣는다 (TUTORIAL.md 6-1)" },
  { name: "내 사이트에 관리자 페이지 올리기", ok: siteState === "installed", info: { none: "사이트 저장소 없음", cloned: "저장소는 있음, 페이지 미설치", installed: `${repoDir}에 ${adminFile} 있음` }[siteState], who: "Claude (푸시 전 사용자 확인)", todo: "`/site` 를 실행한다. 끝나면 Firebase 승인된 도메인 추가는 사용자가 직접" },
  { name: "콘텐츠 3편 이상 올리기", ok: processed.length >= 3, info: `processed ${processed.length}편${rawNew.length ? `, 아직 안 올린 파일 ${rawNew.length}개` : ""}`, who: "사용자가 링크·파일 제공 → Claude", todo: processed.length ? "`/ingest <내 콘텐츠 링크>` 로 3~5편까지 채운다" : "처음이면 examples/ 연습 대본으로 `/ingest` 를 체험한 뒤 내 콘텐츠 링크로 `/ingest`" },
  { name: "말투 분석 (voice.md)", ok: !voiceEmpty, who: "Claude", todo: "`/analyze-style`" },
  { name: "첫 초고", ok: drafts > 0, info: `초고 ${drafts}개`, who: "Claude", todo: "`/topic-ideas` → `/draft <채널> <주제>`" },
];
const next = steps.find((s) => !s.ok);
const done = steps.filter((s) => s.ok).length;

if (process.argv.includes("--brief")) {
  console.log(`[세팅 진행 상황: ${done}/${steps.length} 완료 — scripts/setup-check.mjs 가 세션 시작 때 자동 점검]`);
  console.log(steps.map((s) => `${s.ok ? "✓" : "·"} ${s.name}${s.info ? ` (${s.info})` : ""}`).join("\n"));
  if (wantsYoutube && !ytdlp) console.log("· (선택) 유튜브 가져오기용 yt-dlp 미설치");
  console.log(next
    ? `다음 할 일: ${next.name} — ${next.todo} [${next.who}]\n사용자가 처음 인사하거나 "뭐 해야 해요?", "어떻게 세팅해요?"라고 물으면 /start 절차대로 이 '다음 할 일' 하나만 쉽게 안내한다.`
    : "세팅 완료. 사용자가 뭘 할지 물으면 /auto 또는 /topic-ideas → /draft 를 권한다.");
} else {
  console.log(`세팅 점검 (${done}/${steps.length} 완료)\n`);
  steps.forEach((s, i) => console.log(`${s.ok ? "✅" : "⬜"} ${i + 1}. ${s.name}${s.info ? ` — ${s.info}` : ""}`));
  if (wantsYoutube) console.log(`${ytdlp ? "✅" : "⬜"} (선택) 유튜브 가져오기용 yt-dlp`);
  console.log(next ? `\n👉 다음 할 일: ${next.name}\n   ${next.todo} (${next.who})` : "\n🎉 세팅이 끝났습니다. /auto 또는 /topic-ideas → /draft 를 써 보세요.");
  console.log("\n※ Firebase 콘솔의 규칙 게시·Google 로그인·승인된 도메인은 여기서 확인할 수 없습니다. 관리자 페이지에 로그인해 보면 알 수 있습니다.");
}
