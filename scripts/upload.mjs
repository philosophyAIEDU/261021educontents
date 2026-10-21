// processed/ 의 JSON을 Firestore에 올린다.
//
// 사용법 (기본은 dry-run: 검증만 하고 쓰지 않음)
//   node scripts/upload.mjs --id script-01            검증만
//   node scripts/upload.mjs --id script-01 --commit   실제 업로드
//   node scripts/upload.mjs --all --commit            processed/ 전체
//   --allow-missing published_at                      지정한 태그가 비어도 경고만 (테스트용)
//
// 인증: 서비스 계정 키 경로를 환경변수로 받는다 (키는 git에 올리지 않는다)
//   GOOGLE_APPLICATION_CREDENTIALS=C:\경로\키.json
// 설정 (환경변수, 없으면 기본값)
//   FIREBASE_PROJECT_ID  Firebase 프로젝트 ID (.env 에 적는다)
//   FIRESTORE_COLLECTION 기본 contents_input (운영자 전용, admin/index.html의 Contents Input 탭)

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROCESSED = path.join(ROOT, "processed");
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "(미설정)";
const COLLECTION = process.env.FIRESTORE_COLLECTION ?? "contents_input";

const REQUIRED_TAGS = ["category", "format", "target_audience", "performance_grade", "published_at", "key_message"];
const GRADES = ["상", "중", "하"];
// 규칙 2: 댓글에 작성자 정보가 남아 있으면 안 된다
const AUTHOR_KEYS = ["author", "author_name", "nickname", "username", "user_id", "profile", "profile_url", "avatar"];

function validate(doc, allowMissing) {
  const errors = [];
  const tags = doc.tags ?? {};
  for (const k of REQUIRED_TAGS) {
    if (tags[k] === null || tags[k] === undefined || tags[k] === "") {
      if (allowMissing.includes(k)) console.warn(`[경고] ${doc.id}: ${k} 비어 있음 (--allow-missing으로 허용됨)`);
      else errors.push(`필수 태그 비어 있음: ${k}`);
    }
  }
  if (tags.performance_grade && !GRADES.includes(tags.performance_grade)) errors.push("performance_grade는 상/중/하 중 하나");
  if (tags.published_at && !/^\d{4}-\d{2}-\d{2}$/.test(tags.published_at)) errors.push("published_at은 YYYY-MM-DD 형식");
  if (tags.format === "댓글") {
    const found = AUTHOR_KEYS.filter((k) => k in doc || k in tags);
    if (found.length) errors.push(`댓글에 작성자 정보 필드 있음: ${found.join(", ")}`);
  }
  if (!doc.id) errors.push("id 없음");
  return errors;
}

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const all = args.includes("--all");
const idIdx = args.indexOf("--id");
const wantedId = idIdx >= 0 ? args[idIdx + 1] : null;
// 예: --allow-missing published_at  (테스트 업로드용 예외. 기본은 모든 필수 태그 필요)
const amIdx = args.indexOf("--allow-missing");
const allowMissing = amIdx >= 0 ? (args[amIdx + 1] ?? "").split(",").filter(Boolean) : [];
if (!all && !wantedId) {
  console.error("--id <문서id> 또는 --all 을 지정하세요.");
  process.exit(1);
}

const files = (await readdir(PROCESSED)).filter((f) => f.endsWith(".json"));
const docs = [];
for (const f of files) {
  const doc = JSON.parse(await readFile(path.join(PROCESSED, f), "utf-8"));
  if (all || doc.id === wantedId) docs.push(doc);
}
if (!docs.length) {
  console.error(`대상 문서를 찾지 못했습니다: ${wantedId}`);
  process.exit(1);
}

// 검증은 dry-run/commit 공통. 하나라도 실패하면 아무것도 올리지 않는다.
let failed = false;
for (const doc of docs) {
  const errors = validate(doc, allowMissing);
  if (errors.length) {
    failed = true;
    console.error(`[거부] ${doc.id}\n  - ${errors.join("\n  - ")}`);
  } else {
    console.log(`[통과] ${doc.id}`);
  }
}
if (failed) {
  console.error("\n검증 실패로 업로드를 중단했습니다. processed/ JSON을 먼저 채워주세요.");
  process.exit(1);
}

// 검수 관문: 중복·개인정보 패턴 (scripts/precheck.mjs). 문제가 있으면 dry-run/commit 모두 중단한다.
const { precheck, loadProcessed, loadRemote, printReport } = await import("./precheck.mjs");
const localAll = await loadProcessed();
if (!commit) {
  if (printReport(precheck(docs, localAll, { allowMissing }))) {
    console.error("\n검수에서 문제가 발견되어 업로드를 중단했습니다.");
    process.exit(1);
  }
}

if (!commit) {
  console.log(`\ndry-run 완료. 실제 업로드: --commit 추가 (대상 ${PROJECT_ID}/${COLLECTION}, ${docs.length}건)`);
  process.exit(0);
}

if (!process.env.FIREBASE_PROJECT_ID) {
  console.error("FIREBASE_PROJECT_ID 환경변수(Firebase 프로젝트 ID)가 필요합니다. .env.example 을 .env 로 복사해 채우세요.");
  process.exit(1);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("GOOGLE_APPLICATION_CREDENTIALS 환경변수(서비스 계정 키 경로)가 필요합니다.");
  process.exit(1);
}

const { initializeApp, applicationDefault } = await import("firebase-admin/app");
const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

// 원격(Firestore)에 이미 있는 문서와도 비교한 뒤에야 쓴다
const remoteDocs = await loadRemote(db, COLLECTION);
if (printReport(precheck(docs, [...localAll, ...remoteDocs], { allowMissing }))) {
  console.error("\n검수에서 문제가 발견되어 업로드를 중단했습니다. 아무것도 올리지 않았습니다.");
  process.exit(1);
}

for (const doc of docs) {
  const { id, ...data } = doc;
  await db.collection(COLLECTION).doc(id).set({ ...data, uploaded_at: FieldValue.serverTimestamp() });
  console.log(`[업로드] ${COLLECTION}/${id}`);
}
