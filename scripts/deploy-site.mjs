// 만든 사이트(site/public)와 Firestore 규칙(site/firestore.rules)을 Firebase Hosting 에 올린다.
// 기본은 미리보기이고 --commit 을 붙여야 실제로 올린다. (/create-site 가 교수님 확인을 받고 실행한다)
//
//   node --env-file=.env scripts/deploy-site.mjs            올릴 파일과 주소만 보여 준다
//   node --env-file=.env scripts/deploy-site.mjs --commit   실제로 올린다 → https://<프로젝트ID>.web.app
//   --rules-only    사이트는 두고 Firestore 규칙만 올린다
//   --use-key       firebase login 대신 .env 의 서비스 계정 키로 올린다 (키에 Hosting 권한이 있어야 한다)
//
// 로그인: 처음 한 번 교수님이 직접 터미널에서 `npx firebase-tools@15.32.1 login` (Claude Code 에서는 앞에 ! 를 붙여 실행)
// 공개 폴더에는 scripts/build-site.mjs 가 만든 파일만 있어야 한다. 다른 파일이 있으면 올리지 않는다.

import { readdir, readFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { ROOT, readProfile } from "./profile.mjs";

export const FIREBASE_TOOLS = "firebase-tools@15.32.1";
const SITE = path.join(ROOT, "site");
const PUBLIC = path.join(SITE, "public");
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const rulesOnly = args.includes("--rules-only");
const fail = (msg) => { console.error(msg); process.exit(1); };

const profile = await readProfile();
const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) fail("FIREBASE_PROJECT_ID 가 없습니다. .env 에 프로젝트 ID 를 적고 `node --env-file=.env scripts/deploy-site.mjs` 로 실행하세요.");
if (!(await exists(path.join(SITE, "firebase.json")))) fail("site/ 가 없습니다. 먼저 `node scripts/build-site.mjs` 로 사이트를 만드세요.");

const config = JSON.parse(await readFile(path.join(SITE, "firebase.json"), "utf-8"));
if (!rulesOnly && !config.hosting) fail("site/ 에는 Firestore 규칙만 있습니다 (build-site --rules-only). 사이트까지 올리려면 node scripts/build-site.mjs 로 만들거나, 규칙만 올리려면 --rules-only 를 붙이세요.");
const targets = [];
if (!rulesOnly) {
  // 공개 폴더 검사: build-site 가 만드는 파일만 허용한다
  const adminFile = profile["설치 파일"] || "knowledge-admin.html";
  const allowed = new Set(["index.html", "post.html", "style.css", "site.js", adminFile]);
  const files = await readdir(PUBLIC).catch(() => []);
  const unexpected = files.filter((f) => !allowed.has(f) && !/^photo\.(jpe?g|png|webp)$/i.test(f));
  if (unexpected.length) fail(`site/public 에 사이트 파일이 아닌 것이 있어 올리지 않습니다: ${unexpected.join(", ")}\n  node scripts/build-site.mjs 로 다시 만드세요.`);
  if (!files.includes("index.html")) fail("site/public/index.html 이 없습니다. node scripts/build-site.mjs 를 먼저 실행하세요.");
  const html = await readFile(path.join(PUBLIC, "index.html"), "utf-8");
  if (/SITE_FIREBASE = null/.test(html)) console.warn("⚠ firebaseConfig 가 아직 없어 '글' 영역과 관리자 페이지 없이 올라갑니다.");
  targets.push("hosting");
  console.log(`올릴 사이트 파일: ${files.join(", ")}`);
}
if (config.firestore) targets.push("firestore:rules");
else console.warn("⚠ profile.md 의 '관리자 이메일'이 없어 Firestore 규칙은 올리지 않습니다 (콘솔에서 직접 게시했거나, 나중에 올리세요).");
if (!targets.length) fail("올릴 것이 없습니다.");

const url = `https://${projectId}.web.app`;
console.log(`대상: Firebase 프로젝트 ${projectId} (${targets.join(", ")})`);
if (!rulesOnly) console.log(`사이트 주소: ${url}   관리자 페이지: ${url}/${profile["설치 파일"] || "knowledge-admin.html"}`);
if (!commit) {
  console.log("\n미리보기 완료. 실제로 올리려면 --commit 을 붙이세요.");
  process.exit(0);
}

// 기본은 교수님이 `firebase login` 한 계정으로 올린다. 서비스 계정 키는 --use-key 일 때만 쓴다
const env = { ...process.env };
if (!args.includes("--use-key")) delete env.GOOGLE_APPLICATION_CREDENTIALS;
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const r = spawnSync(npx, ["--yes", FIREBASE_TOOLS, "deploy", "--config", path.join(SITE, "firebase.json"), "--project", projectId, "--only", targets.join(","), "--non-interactive"],
  { cwd: SITE, env, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8", shell: process.platform === "win32" });
const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
// 내부 오류 추적(at …)과 npm 경고는 빼고 마지막 몇 줄만 보여 준다
process.stdout.write(out.split("\n").filter((l) => l.trim() && !/^\s+at |^npm warn|MetadataLookupWarning|--trace-warnings/.test(l)).slice(-12).join("\n") + "\n");
if (r.status !== 0) {
  if (/login|authenticat|credentials|401|403/i.test(out)) {
    console.error(`\n[로그인 필요] 교수님이 직접 한 번 로그인해야 합니다. Claude Code 입력창에 다음을 그대로 입력하세요:\n  ! npx --yes ${FIREBASE_TOOLS} login\n브라우저에서 Firestore를 만든 그 구글 계정으로 로그인한 뒤 다시 올리면 됩니다.`);
  } else if (/Hosting|site.*not found|not been used|disabled/i.test(out)) {
    console.error("\n[Hosting 준비 필요] Firebase 콘솔 > 빌드 > Hosting > 시작하기 를 한 번 눌러 Hosting 을 켠 뒤 다시 올리세요.");
  }
  process.exit(1);
}
console.log(`\n[완료] ${rulesOnly ? "Firestore 규칙을 올렸습니다." : `사이트가 올라갔습니다: ${url}`}`);
