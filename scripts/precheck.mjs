// 업로드 전 검수: 필수 태그, 중복, 개인정보(특히 학생 정보) 패턴을 검사한다. (읽기 전용, 아무것도 쓰지 않는다)
//
//   node scripts/precheck.mjs --id lecture-06                 processed/ 안에서만 비교
//   node scripts/precheck.mjs --id lecture-06,lecture-07      여러 건
//   node scripts/precheck.mjs --id lecture-06 --remote        Firestore에 이미 올라간 문서와도 비교 (키 필요)
//   node scripts/precheck.mjs --id paper-01 --allow-missing created_at   비어도 경고로 낮춤
//
// 종료 코드: 문제가 있으면 1, 없으면 0. 이름 같은 판단이 필요한 항목은 data-checker 에이전트가 본문을 읽고 확인한다.

import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_TAGS, FORMATS, KNOWLEDGE_TYPES, GRADES, PERSON_KEYS, INPUT_COLLECTION, isEmpty } from "./schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROCESSED = path.join(ROOT, "processed");

const PII = [
  { name: "이메일", re: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
  { name: "전화번호", re: /(?<!\d)01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/g },
  { name: "전화번호(지역번호)", re: /(?<!\d)0\d{1,2}[-.\s]\d{3,4}[-.\s]\d{4}(?!\d)/g },
  { name: "주민등록번호 형태", re: /(?<!\d)\d{6}-[1-4]\d{6}(?!\d)/g },
  { name: "학번", re: /학번\s*[:：]?\s*\d{6,10}/g },
  { name: "@아이디/멘션", re: /(?<![\w.@])@[\w가-힣._]{2,}/g },
];
// 학번처럼 보이는 숫자(20으로 시작하는 9~10자리). 날짜·전화번호와 헷갈릴 수 있어 경고로만 본다
const STUDENT_NUMBER = /(?<![\d-])20\d{7,8}(?![\d-])/g;
// 성적·평가 결과가 특정인과 붙어 있는 표현
const GRADE_RECORD = /(학점|성적|점수)\s*[:：]?\s*(A\+|A0|A-|B\+|B0|B-|C\+|C0|D\+|F|\d{1,3}\s*점)/g;
const PROFILE_URL = /(youtube\.com\/(@|channel\/|c\/|user\/)|instagram\.com\/|facebook\.com\/|x\.com\/|twitter\.com\/|threads\.net\/|open\.kakao\.com|t\.me\/)/i;
const HONORIFIC = /[가-힣]{2,4}\s?(님|씨|학생|군|양)(?![가-힣])/g;
const HONORIFIC_STOP = new Set(["여러분", "학생", "학생분", "수강생", "청중", "독자", "선생", "교수", "조교", "회원", "여기", "저희", "대학원", "학부", "신입", "재학", "복학", "질문하신", "질문한", "어떤", "모든", "많은", "다른", "우리", "같은", "여러", "남학", "여학"]);

const hash = (s) => createHash("sha256").update(s.replace(/\s+/g, " ").trim()).digest("hex");
function shingles(text) {
  const w = text.replace(/\s+/g, " ").trim().split(" ");
  const set = new Set();
  for (let i = 0; i + 4 <= w.length; i++) set.add(w.slice(i, i + 4).join(" "));
  return set;
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
const snippet = (text, idx, len = 12) => text.slice(Math.max(0, idx - len), idx + len).replace(/\s+/g, " ");

/** 필수 태그·형식 검사. upload.mjs 도 같은 함수를 쓴다. */
export function tagProblems(doc, allowMissing = []) {
  const problems = [], warnings = [];
  const tags = doc.tags ?? {};
  for (const k of REQUIRED_TAGS) {
    if (isEmpty(tags[k])) {
      (allowMissing.includes(k) ? warnings : problems).push(`필수 태그 비어 있음: ${k}${allowMissing.includes(k) ? " (사용자가 허용함)" : ""}`);
    }
  }
  if (tags.format && !(tags.format in FORMATS)) problems.push(`format은 ${Object.keys(FORMATS).join(" / ")} 중 하나여야 함`);
  if (tags.knowledge_type && !KNOWLEDGE_TYPES.includes(tags.knowledge_type)) problems.push(`knowledge_type은 ${KNOWLEDGE_TYPES.join(" / ")} 중 하나여야 함`);
  if (tags.created_at && !/^\d{4}-\d{2}-\d{2}$/.test(tags.created_at)) problems.push("created_at은 YYYY-MM-DD 형식이어야 함");
  if (!isEmpty(tags.reception_grade) && !GRADES.includes(tags.reception_grade)) problems.push("reception_grade(선택)는 상/중/하 중 하나여야 함");
  if (!doc.id) problems.push("id 없음");
  return { problems, warnings };
}

/** docs: 검사 대상, others: 비교 대상(processed 전체 + 원격). 반환: { [id]: { problems, warnings, infos } } */
export function precheck(docs, others, { allowMissing = [] } = {}) {
  const result = {};
  for (const doc of docs) {
    const { problems, warnings } = tagProblems(doc, allowMissing);
    const infos = [];
    const tags = doc.tags ?? {};
    if (!doc.body || !doc.body.trim()) problems.push("본문(body)이 비어 있음");

    // 2) 중복
    const body = doc.body ?? "";
    const isQuestion = tags.format === "학생 질문";
    const myHash = hash(body);
    const myShingles = shingles(body);
    for (const o of others) {
      if (o.id === doc.id) {
        if (o._remote) infos.push(hash(o.body ?? "") === myHash ? "Firestore에 같은 id가 이미 있음 (내용 동일, 덮어쓰기)" : "Firestore에 같은 id가 이미 있음 (내용이 달라 덮어쓰기됨)");
        continue;
      }
      const where = `${o._remote ? "Firestore" : "processed"}의 ${o.id}`;
      if (isQuestion && o.parent_id !== doc.parent_id) continue; // 질문은 같은 강의 안에서만 비교
      if (doc.source_file && o.source_file === doc.source_file && !isQuestion) problems.push(`원본 파일이 ${where}와 같음 (${doc.source_file})`);
      if (doc.youtube_id && o.youtube_id === doc.youtube_id) problems.push(`같은 유튜브 영상이 ${where}에 이미 있음 (${doc.youtube_id})`);
      if (doc.source_url && o.source_url === doc.source_url) problems.push(`같은 글 주소가 ${where}에 이미 있음 (${doc.source_url})`);
      if (doc.repo_path && o.repo_path === doc.repo_path) problems.push(`같은 저장소 글이 ${where}에 이미 있음 (${doc.repo_path})`);
      if (body && hash(o.body ?? "") === myHash) problems.push(`본문이 ${where}와 완전히 같음`);
      else if (!isQuestion && body.length > 200 && jaccard(myShingles, shingles(o.body ?? "")) >= 0.85) problems.push(`본문이 ${where}와 거의 같음 (유사도 85% 이상)`);
    }

    // 3) 개인정보 패턴 (규칙 2)
    for (const k of PERSON_KEYS) if (k in doc || k in tags) problems.push(`사람 신원 정보 필드가 있음: ${k}`);
    for (const field of ["body", "key_message"]) {
      const text = field === "body" ? body : tags.key_message ?? "";
      for (const p of PII) {
        for (const m of text.matchAll(p.re)) problems.push(`${field}에 ${p.name} 형태가 있음: "${snippet(text, m.index)}"`);
      }
      for (const m of text.matchAll(GRADE_RECORD)) (isQuestion ? problems : warnings).push(`${field}에 성적·점수 표현이 있음 (특정 학생의 성적이면 삭제): "${snippet(text, m.index)}"`);
      const sn = [...text.matchAll(STUDENT_NUMBER)];
      if (sn.length) (isQuestion ? problems : warnings).push(`${field}에 학번으로 보일 수 있는 숫자 ${sn.length}건 (확인 필요): "${snippet(text, sn[0].index)}"`);
      const pm = text.match(PROFILE_URL);
      if (pm) (isQuestion ? problems : warnings).push(`${field}에 프로필/SNS 주소가 있음: "${snippet(text, pm.index, 20)}"`);
    }
    const names = [...body.matchAll(HONORIFIC)].filter((m) => !HONORIFIC_STOP.has(m[0].replace(/\s?(님|씨|학생|군|양)$/, "")));
    if (names.length) warnings.push(`사람 이름으로 보일 수 있는 표현 ${names.length}건 (확인 필요): ${names.slice(0, 5).map((m) => `"${m[0]}"`).join(", ")}`);

    result[doc.id] = { problems, warnings, infos };
  }
  return result;
}

export async function loadProcessed() {
  const files = (await readdir(PROCESSED)).filter((f) => f.endsWith(".json"));
  return Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(PROCESSED, f), "utf-8"))));
}

export async function loadRemote(db, collection) {
  const snap = await db.collection(collection).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), _remote: true }));
}

export function printReport(result) {
  let bad = false;
  for (const [id, r] of Object.entries(result)) {
    const verdict = r.problems.length ? "문제 있음" : "통과";
    if (r.problems.length) bad = true;
    console.log(`\n[${verdict}] ${id}`);
    r.problems.forEach((p) => console.log(`  ✖ ${p}`));
    r.warnings.forEach((w) => console.log(`  ⚠ ${w}`));
    r.infos.forEach((i) => console.log(`  ℹ ${i}`));
  }
  return bad;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const val = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
  const ids = (val("--id") ?? "").split(",").filter(Boolean);
  const allowMissing = (val("--allow-missing") ?? "").split(",").filter(Boolean);
  if (!ids.length) { console.error("--id <문서id[,문서id]> 를 지정하세요."); process.exit(1); }

  const all = await loadProcessed();
  const docs = ids.map((id) => all.find((d) => d.id === id) ?? null);
  const missing = ids.filter((_, i) => !docs[i]);
  if (missing.length) { console.error(`processed/에 없는 id: ${missing.join(", ")}`); process.exit(1); }

  let others = all;
  if (args.includes("--remote")) {
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.GOOGLE_APPLICATION_CREDENTIALS) { console.error("--remote 는 FIREBASE_PROJECT_ID, GOOGLE_APPLICATION_CREDENTIALS 가 필요합니다 (.env 참고)."); process.exit(1); }
    const { initializeApp, applicationDefault } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
    others = [...all, ...(await loadRemote(getFirestore(), INPUT_COLLECTION))];
  }
  const bad = printReport(precheck(docs, others, { allowMissing }));
  console.log(bad ? "\n판정: 업로드 중단 (문제 있음)" : "\n판정: 통과 (이름 등 판단이 필요한 항목은 본문을 직접 확인할 것)");
  process.exit(bad ? 1 : 0);
}
