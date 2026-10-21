// 지식 창고(processed/)의 자료 중 아직 결과물 초고가 없는 것을 찾아 "만들 초고 목록"을 만든다. (읽기 전용)
// /make 와 /auto 가 이 목록대로 초고를 쓴다. 이미 쓴 초고는 drafts/ 의 "- 종류:", "- 근거 자료:" 줄로 판단한다.
//
//   node scripts/plan.mjs              목록을 표로 보여준다
//   node scripts/plan.mjs --json       스킬이 읽는 JSON
//   --limit 6                          최대 몇 개 (기본: profile.md 의 '한 번에 만들 초고 수', 없으면 6)
//   --id lecture-03                    이 자료로 만들 것만
//
// 자료 종류별로 만들 결과물은 scripts/schema.mjs 의 DEFAULT_OUTPUTS.
// profile.md 의 '자동으로 만들 결과물'(예: 학습자료, 평가문항)을 적으면 그 종류만 만든다.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, readProfile } from "./profile.mjs";
import { OUTPUT_TYPES, DEFAULT_OUTPUTS, QNA_MIN_FAQ, QNA_MIN_MISCONCEPTION } from "./schema.mjs";

async function walk(dir, out = []) {
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

/** drafts/ 에서 "자료 id|종류" 로 이미 만든 결과물을 모은다 */
export async function coveredOutputs() {
  const covered = new Set();
  for (const f of await walk(path.join(ROOT, "drafts"))) {
    const text = await readFile(f, "utf-8");
    const type = text.match(/^- 종류:\s*(.+)$/m)?.[1]?.trim();
    const ids = text.match(/^- 근거 자료:\s*(.+)$/m)?.[1]?.match(/(?:qna-)?[a-z]+-\d+(?:-\d+)?/g) ?? [];
    if (type) ids.forEach((id) => covered.add(`${id}|${type}`));
  }
  return covered;
}

export async function loadDocs() {
  let files = [];
  try { files = (await readdir(path.join(ROOT, "processed"))).filter((f) => f.endsWith(".json")); } catch { return []; }
  const docs = [];
  for (const f of files) {
    try { docs.push(JSON.parse(await readFile(path.join(ROOT, "processed", f), "utf-8"))); } catch {}
  }
  return docs;
}

export function allowedTypes(profile) {
  const want = (profile["자동으로 만들 결과물"] ?? "").split(/[,，、]/).map((s) => s.trim()).filter((s) => s in OUTPUT_TYPES);
  return want.length ? new Set(want) : null;
}

export function makePlan(docs, covered, { allowed = null, onlyId = null } = {}) {
  const items = [];
  const ok = (type) => !allowed || allowed.has(type);
  const byDate = (a, b) => String(b.tags?.created_at ?? "").localeCompare(String(a.tags?.created_at ?? ""));
  const materials = docs.filter((d) => d.tags?.format !== "학생 질문").sort(byDate);

  for (const d of materials) {
    if (onlyId && d.id !== onlyId) continue;
    const untouched = !Object.keys(OUTPUT_TYPES).some((t) => covered.has(`${d.id}|${t}`));
    for (const type of DEFAULT_OUTPUTS[d.tags?.format] ?? []) {
      if (!ok(type) || covered.has(`${d.id}|${type}`)) continue;
      items.push({ type, folder: OUTPUT_TYPES[type], sources: [d.id], title: d.title ?? d.id, target: d.tags?.target_audience ?? "", mode: "재활용", untouched, date: d.tags?.created_at ?? "" });
    }
  }

  // 학생 질문은 강의별로 묶어서 FAQ 학습자료·오개념 평가문항으로 만든다
  const groups = new Map();
  for (const q of docs.filter((d) => d.tags?.format === "학생 질문" && d.parent_id)) {
    if (!groups.has(q.parent_id)) groups.set(q.parent_id, []);
    groups.get(q.parent_id).push(q);
  }
  for (const [parent, qs] of groups) {
    if (onlyId && parent !== onlyId) continue;
    const ids = qs.map((q) => q.id);
    const title = docs.find((d) => d.id === parent)?.title ?? parent;
    const done = (type) => ids.some((id) => covered.has(`${id}|${type}`));
    if (qs.length >= QNA_MIN_FAQ && ok("학습자료") && !done("학습자료")) {
      items.push({ type: "학습자료", folder: "handout", sources: [parent, ...ids], title: `${title} — 자주 묻는 질문`, target: qs[0].tags?.target_audience ?? "", mode: "학생 질문 FAQ", untouched: true, date: "" });
    }
    const mis = qs.filter((q) => q.question_type === "오개념");
    if (mis.length >= QNA_MIN_MISCONCEPTION && ok("평가문항") && !done("평가문항")) {
      // 그 강의로 만들 평가문항이 이미 목록에 있으면 따로 만들지 않고 오개념을 근거에 더한다
      const quiz = items.find((it) => it.type === "평가문항" && it.sources.length === 1 && it.sources[0] === parent);
      if (quiz) { quiz.sources.push(...mis.map((q) => q.id)); quiz.mode = "재활용 + 오개념"; continue; }
      items.push({ type: "평가문항", folder: "quiz", sources: [parent, ...mis.map((q) => q.id)], title: `${title} — 오개념 확인 문항`, target: qs[0].tags?.target_audience ?? "", mode: "오개념 평가문항", untouched: true, date: "" });
    }
  }

  // 아직 결과물이 하나도 없는 자료를 먼저, 그다음 최근 자료
  return items.sort((a, b) => Number(b.untouched) - Number(a.untouched) || String(b.date).localeCompare(String(a.date)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const val = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
  const profile = await readProfile();
  const limit = Number(val("--limit") ?? (Number(profile["한 번에 만들 초고 수"]) || 6));
  const docs = await loadDocs();
  const all = makePlan(docs, await coveredOutputs(), { allowed: allowedTypes(profile), onlyId: val("--id") });
  const plan = all.slice(0, limit);
  if (args.includes("--json")) {
    console.log(JSON.stringify({ materials: docs.filter((d) => d.tags?.format !== "학생 질문").length, questions: docs.filter((d) => d.tags?.format === "학생 질문").length, total: all.length, plan }, null, 2));
  } else if (!docs.length) {
    console.log("지식 창고(processed/)에 자료가 없습니다. raw/ 에 자료를 넣고 /make 또는 /ingest 를 먼저 하세요.");
  } else if (!plan.length) {
    console.log(`자료 ${docs.length}편 모두 결과물 초고가 있습니다. 새 자료를 넣거나 /asset-ideas 로 다른 결과물을 찾아보세요.`);
  } else {
    const nq = docs.filter((d) => d.tags?.format === "학생 질문").length;
    console.log(`만들 초고 ${plan.length}개 (전체 후보 ${all.length}개, 자료 ${docs.length - nq}편${nq ? ` · 학생 질문 ${nq}건` : ""})\n`);
    plan.forEach((p, i) => console.log(`${i + 1}. [${p.type}] ${p.title}  ← ${p.sources.join(", ")}  (${p.mode}${p.target ? `, 대상: ${p.target}` : ""})`));
    if (all.length > plan.length) console.log(`\n나머지 ${all.length - plan.length}개는 다음 실행에서 만듭니다.`);
  }
}
