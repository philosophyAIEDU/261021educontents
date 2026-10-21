// processed/ 의 JSON을 Firestore 지식 창고(knowledge_input)에 올린다.
//
// 사용법 (기본은 dry-run: 검증만 하고 쓰지 않음)
//   node scripts/upload.mjs --id lecture-01            검증만
//   node scripts/upload.mjs --id lecture-01 --commit   실제 업로드
//   node scripts/upload.mjs --all --commit             processed/ 전체
//   --allow-missing created_at                         지정한 태그가 비어도 경고만 (사용자가 허용할 때만)
//
// 인증: 서비스 계정 키 경로를 환경변수로 받는다 (키는 git에 올리지 않는다)
//   GOOGLE_APPLICATION_CREDENTIALS=keys/service-account.json
// 설정 (환경변수, 없으면 기본값)
//   FIREBASE_PROJECT_ID  Firebase 프로젝트 ID (.env 에 적는다)
//   FIRESTORE_COLLECTION 기본 knowledge_input (관리자 페이지의 지식 창고 탭)

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INPUT_COLLECTION } from "./schema.mjs";
import { tagProblems, precheck, loadProcessed, loadRemote, printReport } from "./precheck.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROCESSED = path.join(ROOT, "processed");
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "(미설정)";

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const all = args.includes("--all");
const idIdx = args.indexOf("--id");
const wantedId = idIdx >= 0 ? args[idIdx + 1] : null;
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
  const { problems, warnings } = tagProblems(doc, allowMissing);
  warnings.forEach((w) => console.warn(`[경고] ${doc.id}: ${w}`));
  if (problems.length) {
    failed = true;
    console.error(`[거부] ${doc.id}\n  - ${problems.join("\n  - ")}`);
  } else {
    console.log(`[통과] ${doc.id}`);
  }
}
if (failed) {
  console.error("\n검증 실패로 업로드를 중단했습니다. processed/ JSON을 먼저 채워주세요.");
  process.exit(1);
}

// 검수 관문: 중복·개인정보 패턴. 문제가 있으면 dry-run/commit 모두 중단한다.
const localAll = await loadProcessed();
if (!commit) {
  if (printReport(precheck(docs, localAll, { allowMissing }))) {
    console.error("\n검수에서 문제가 발견되어 업로드를 중단했습니다.");
    process.exit(1);
  }
  console.log(`\ndry-run 완료. 실제 업로드: --commit 추가 (대상 ${PROJECT_ID}/${INPUT_COLLECTION}, ${docs.length}건)`);
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
const remoteDocs = await loadRemote(db, INPUT_COLLECTION);
if (printReport(precheck(docs, [...localAll, ...remoteDocs], { allowMissing }))) {
  console.error("\n검수에서 문제가 발견되어 업로드를 중단했습니다. 아무것도 올리지 않았습니다.");
  process.exit(1);
}

for (const doc of docs) {
  const { id, ...data } = doc;
  await db.collection(INPUT_COLLECTION).doc(id).set({ ...data, uploaded_at: FieldValue.serverTimestamp() });
  console.log(`[업로드] ${INPUT_COLLECTION}/${id}`);
}
