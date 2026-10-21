// 업로드 전 검수: 필수 태그, 중복, 개인정보 패턴을 검사한다. (읽기 전용, 아무것도 쓰지 않는다)
//
//   node scripts/precheck.mjs --id script-06                 processed/ 안에서만 비교
//   node scripts/precheck.mjs --id script-06,script-07       여러 건
//   node scripts/precheck.mjs --id script-06 --remote        Firestore에 이미 올라간 문서와도 비교 (키 필요)
//   node scripts/precheck.mjs --id newsletter-01 --allow-missing published_at   비어도 경고로 낮춤
//
// 종료 코드: 문제가 있으면 1, 없으면 0. 이름 같은 판단이 필요한 항목은 data-checker 에이전트가 본문을 읽고 확인한다.

import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROCESSED = path.join(ROOT, "processed");
export const REQUIRED_TAGS = ["category", "format", "target_audience", "performance_grade", "published_at", "key_message"];
const GRADES = ["상", "중", "하"];
const AUTHOR_KEYS = ["author", "author_name", "nickname", "username", "user_id", "profile", "profile_url", "avatar", "channel_name"];

const PII = [
  { name: "이메일", re: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
  { name: "전화번호", re: /(?<!\d)01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/g },
  { name: "전화번호(지역번호)", re: /(?<!\d)0\d{1,2}[-.\s]\d{3,4}[-.\s]\d{4}(?!\d)/g },
  { name: "주민등록번호 형태", re: /(?<!\d)\d{6}-[1-4]\d{6}(?!\d)/g },
  { name: "@아이디/멘션", re: /(?<![\w.@])@[\w가-힣._]{2,}/g },
];
const PROFILE_URL = /(youtube\.com\/(@|channel\/|c\/|user\/)|instagram\.com\/|facebook\.com\/|x\.com\/|twitter\.com\/|threads\.net\/|open\.kakao\.com|t\.me\/)/i;
const HONORIFIC = /[가-힣]{2,4}\s?(님|씨)(?![가-힣])/g;
const HONORIFIC_STOP = new Set(["여러분", "구독자", "시청자", "고객", "선생", "사장", "교수", "회원", "상담원분", "여기", "저희"]);

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

/** docs: 검사 대상, others: 비교 대상(processed 전체 + 원격). 반환: { [id]: { problems, warnings, infos } } */
export function precheck(docs, others, { allowMissing = [] } = {}) {
  const result = {};
  for (const doc of docs) {
    const problems = [], warnings = [], infos = [];
    const tags = doc.tags ?? {};

    // 1) 필수 태그
    for (const k of REQUIRED_TAGS) {
      if (tags[k] === null || tags[k] === undefined || tags[k] === "") {
        (allowMissing.includes(k) ? warnings : problems).push(`필수 태그 비어 있음: ${k}${allowMissing.includes(k) ? " (사용자가 허용함)" : ""}`);
      }
    }
    if (tags.performance_grade && !GRADES.includes(tags.performance_grade)) problems.push("performance_grade는 상/중/하 중 하나여야 함");
    if (tags.published_at && !/^\d{4}-\d{2}-\d{2}$/.test(tags.published_at)) problems.push("published_at은 YYYY-MM-DD 형식이어야 함");
    if (!doc.body || !doc.body.trim()) problems.push("본문(body)이 비어 있음");

    // 2) 중복
    const body = doc.body ?? "";
    const isComment = tags.format === "댓글";
    const myHash = hash(body);
    const myShingles = shingles(body);
    for (const o of others) {
      if (o.id === doc.id) {
        if (o._remote) infos.push(hash(o.body ?? "") === myHash ? "Firestore에 같은 id가 이미 있음 (내용 동일, 덮어쓰기)" : "Firestore에 같은 id가 이미 있음 (내용이 달라 덮어쓰기됨)");
        continue;
      }
      const where = `${o._remote ? "Firestore" : "processed"}의 ${o.id}`;
      if (isComment && o.parent_id !== doc.parent_id) continue; // 댓글은 같은 부모 안에서만 비교
      if (doc.source_file && o.source_file === doc.source_file && !isComment) problems.push(`원본 파일이 ${where}와 같음 (${doc.source_file})`);
      if (doc.youtube_id && o.youtube_id === doc.youtube_id) problems.push(`같은 유튜브 영상이 ${where}에 이미 있음 (${doc.youtube_id})`);
      if (doc.source_url && o.source_url === doc.source_url) problems.push(`같은 글 주소가 ${where}에 이미 있음 (${doc.source_url})`);
      if (doc.repo_path && o.repo_path === doc.repo_path) problems.push(`같은 저장소 글이 ${where}에 이미 있음 (${doc.repo_path})`);
      if (body && hash(o.body ?? "") === myHash) problems.push(`본문이 ${where}와 완전히 같음`);
      else if (!isComment && body.length > 200 && jaccard(myShingles, shingles(o.body ?? "")) >= 0.85) problems.push(`본문이 ${where}와 거의 같음 (유사도 85% 이상)`);
    }

    // 3) 개인정보 패턴
    for (const k of AUTHOR_KEYS) if (k in doc || k in tags) problems.push(`작성자 정보 필드가 있음: ${k}`);
    for (const field of ["body", "key_message"]) {
      const text = field === "body" ? body : tags.key_message ?? "";
      for (const p of PII) {
        for (const m of text.matchAll(p.re)) problems.push(`${field}에 ${p.name} 형태가 있음: "${snippet(text, m.index)}"`);
      }
      const pm = text.match(PROFILE_URL);
      if (pm) (isComment ? problems : warnings).push(`${field}에 프로필/SNS 주소가 있음: "${snippet(text, pm.index, 20)}"`);
    }
    const names = [...body.matchAll(HONORIFIC)].filter((m) => !HONORIFIC_STOP.has(m[0].replace(/\s?(님|씨)$/, "")));
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
    initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID ?? "(미설정)" });
    others = [...all, ...(await loadRemote(getFirestore(), process.env.FIRESTORE_COLLECTION ?? "contents_input"))];
  }
  const bad = printReport(precheck(docs, others, { allowMissing }));
  console.log(bad ? "\n판정: 업로드 중단 (문제 있음)" : "\n판정: 통과 (이름 등 판단이 필요한 항목은 본문을 직접 확인할 것)");
  process.exit(bad ? 1 : 0);
}
