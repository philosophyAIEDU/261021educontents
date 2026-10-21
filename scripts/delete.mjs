// Firestore 문서 1개를 삭제한다. 기본은 dry-run이며 --commit을 붙여야 실제로 지운다.
//
//   node scripts/delete.mjs --id script-01            대상만 출력 (삭제 안 함)
//   node scripts/delete.mjs --id script-01 --commit   실제 삭제
//
// 인증: GOOGLE_APPLICATION_CREDENTIALS=<서비스 계정 키 경로>
// 설정: FIREBASE_PROJECT_ID, FIRESTORE_COLLECTION(기본 contents_input)
// 일괄 삭제(--all)는 지원하지 않는다.

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "(미설정)";
const COLLECTION = process.env.FIRESTORE_COLLECTION ?? "contents_input";

const args = process.argv.slice(2);
const idIdx = args.indexOf("--id");
const id = idIdx >= 0 ? args[idIdx + 1] : null;
const commit = args.includes("--commit");

if (!id || id.startsWith("--") || args.includes("--all")) {
  console.error("--id <문서id> 를 하나만 지정하세요. (--all 은 지원하지 않습니다)");
  process.exit(1);
}
if (!/^[\w-]+$/.test(id)) {
  console.error(`문서 id 형식이 올바르지 않습니다: ${id}`);
  process.exit(1);
}

console.log(`대상: ${PROJECT_ID}/${COLLECTION}/${id}`);
if (!commit) {
  console.log("dry-run: 삭제하지 않았습니다. 실제 삭제는 --commit 을 추가하세요.");
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
const { getFirestore } = await import("firebase-admin/firestore");
initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const ref = getFirestore().collection(COLLECTION).doc(id);
const snap = await ref.get();
if (!snap.exists) {
  console.error("해당 문서가 Firestore에 없습니다. 삭제할 것이 없습니다.");
  process.exit(1);
}
await ref.delete();
console.log(`[삭제] ${COLLECTION}/${id}`);
