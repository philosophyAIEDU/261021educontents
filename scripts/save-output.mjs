// 결과물 1건을 Firestore contents_output 에 저장한다. 기본은 dry-run, --commit을 붙여야 저장한다.
//
//   node scripts/save-output.mjs --file reports/feedback/2026-10-05_주제.json            검증만
//   node scripts/save-output.mjs --file reports/feedback/2026-10-05_주제.json --commit   저장
//   node scripts/save-output.mjs --draft drafts/script/2026-09-27_주제.md --commit    초고(.md)를 바로 저장 (/draft 가 자동으로 한다)
//     - 같은 초고 경로는 같은 문서 id를 쓰므로 다시 실행하면 새로 쌓이지 않고 덮어쓴다(updatedAt 갱신)
//     - 검수 메모가 비었거나 "(검수 중)"이면, 미해결 항목이 있으면 거부한다(--allow-unresolved 로 무시 가능)
//
// 파일 형식: { "title": "...", "type": "스레드", "sourceIds": ["script-01"], "body": "...", "meta": { ... } }
//   meta는 선택(성과 피드백 등 구조화된 값, 2000자 이하 객체)
// 인증: GOOGLE_APPLICATION_CREDENTIALS=<서비스 계정 키 경로>
// 화면: admin/index.html 의 Contents Output 탭 (관리자 전용)

import { readFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "(미설정)";
const COLLECTION = "contents_output";

const args = process.argv.slice(2);
const fIdx = args.indexOf("--file");
const file = fIdx >= 0 ? args[fIdx + 1] : null;
const dIdx = args.indexOf("--draft");
const draft = dIdx >= 0 ? args[dIdx + 1] : null;
const commit = args.includes("--commit");
const allowUnresolved = args.includes("--allow-unresolved");
if (!file && !draft) {
  console.error("--file <결과물 JSON 경로> 또는 --draft <초고 .md 경로> 를 지정하세요.");
  process.exit(1);
}

const errors = [];
let doc;
let docId = null; // --draft 는 초고 경로로 정한 고정 id (재실행 시 덮어쓰기)
if (draft) {
  const rel = path.relative(ROOT, path.resolve(ROOT, draft)).split(path.sep).join("/");
  const text = (await readFile(path.resolve(ROOT, draft), "utf-8")).replace(/\r\n/g, "\n");
  const title = (text.match(/^# (.+)$/m)?.[1] ?? "").replace(/\s+—\s+[^—]*초고\s*$/, "").trim();
  const type = text.match(/^- 채널:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const sourceIds = text.match(/^- 근거 자료:\s*(.+)$/m)?.[1]?.match(/(?:comment-)?[a-z]+-\d+(?:-\d+)?/g) ?? [];
  const startAt = text.search(/^## 초고\s*$/m);
  const endAt = text.search(/^## 적용한 규칙/m);
  const body = startAt < 0 ? "" : text.slice(text.indexOf("\n", startAt) + 1, endAt < 0 ? undefined : endAt).trim();
  const reviewAt = text.search(/^## 검수 메모/m);
  const review = reviewAt < 0 ? "" : text.slice(text.indexOf("\n", reviewAt) + 1);
  if (!review.trim() || review.includes("(검수 중)")) errors.push("검수 메모가 비었거나 '(검수 중)' 상태 (검수가 끝난 뒤에 저장)");
  if (!allowUnresolved && /^- 미해결:\s*(?!없음)\S/m.test(review)) errors.push("검수 메모에 미해결 항목이 있음 (확인 후 --allow-unresolved)");
  const voice = review.match(/^- voice-checker:\s*(.+)$/m)?.[1]?.trim();
  const risk = review.match(/^- risk-checker:\s*(.+)$/m)?.[1]?.trim();
  doc = { title, type, sourceIds, body, meta: { draftPath: rel, ...(voice ? { voice } : {}), ...(risk ? { risk } : {}) } };
  docId = createHash("sha1").update(rel).digest("hex").slice(0, 20);
} else {
  doc = JSON.parse(await readFile(path.resolve(ROOT, file), "utf-8"));
}
const label = draft ?? file;
if (typeof doc.title !== "string" || !doc.title.trim() || doc.title.length > 120) errors.push("title은 1~120자 문자열");
if (typeof doc.body !== "string" || !doc.body.trim()) errors.push("body가 비어 있음");
if (doc.type !== undefined && (typeof doc.type !== "string" || doc.type.length > 60)) errors.push("type은 60자 이하 문자열");
const sourceIds = doc.sourceIds ?? [];
if (!Array.isArray(sourceIds)) errors.push("sourceIds는 배열");
else {
  for (const s of sourceIds) {
    try { await access(path.join(ROOT, "processed", `${s}.json`)); }
    catch { errors.push(`sourceIds에 processed/에 없는 id: ${s}`); }
  }
}
const meta = doc.meta ?? null;
if (meta !== null && (typeof meta !== "object" || Array.isArray(meta) || JSON.stringify(meta).length > 2000)) {
  errors.push("meta는 2000자 이하의 JSON 객체여야 함");
}
if (errors.length) {
  console.error(`[거부] ${label}\n  - ${errors.join("\n  - ")}`);
  process.exit(1);
}
console.log(`[통과] ${doc.title} (${doc.type ?? "종류 없음"}, 참고: ${sourceIds.join(", ") || "없음"})`);

if (!commit) {
  console.log(`dry-run 완료. 저장: --commit 추가 (대상 ${PROJECT_ID}/${COLLECTION})`);
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
const payload = {
  title: doc.title.trim(),
  type: (doc.type ?? "").trim(),
  sourceIds,
  body: doc.body,
  ...(meta ? { meta } : {}),
};
const col = getFirestore().collection(COLLECTION);
if (docId) {
  const ref = col.doc(docId);
  const exists = (await ref.get()).exists;
  if (exists) await ref.set({ ...payload, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  else await ref.set({ ...payload, createdAt: FieldValue.serverTimestamp() });
  console.log(`[${exists ? "갱신" : "저장"}] ${COLLECTION}/${ref.id}`);
} else {
  const ref = await col.add({ ...payload, createdAt: FieldValue.serverTimestamp() });
  console.log(`[저장] ${COLLECTION}/${ref.id}`);
}
