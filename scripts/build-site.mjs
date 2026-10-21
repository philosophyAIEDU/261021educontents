// 교수님 사이트를 만든다: profile.md + site-content.md + site-template/ → site/public/
// 관리자 페이지(admin/index.html)도 site/public/knowledge-admin.html 로 함께 넣고,
// Firebase 배포에 쓸 site/firebase.json 과 site/firestore.rules(관리자 이메일을 넣은 것)를 만든다.
// site/ 는 매번 새로 만드는 결과물 폴더이고 git 에 올라가지 않는다.
//
//   node scripts/build-site.mjs           만든다 (site/public 을 새로 씀)
//   node scripts/build-site.mjs --check   만들지 않고 빠진 것만 알려 준다
//   node scripts/build-site.mjs --rules-only   사이트 없이 Firestore 규칙만 만든다 (기존 사이트 /site, 내 컴퓨터에서만 볼 때)
//
// 공개 폴더(site/public)에는 이 스크립트가 만든 파일만 들어간다. raw/, processed/, drafts/, .env, keys/ 는 절대 넣지 않는다.

import { readFile, writeFile, mkdir, rm, copyFile, readdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, readProfile } from "./profile.mjs";

const TEMPLATE = path.join(ROOT, "site-template");
const OUT = path.join(ROOT, "site");
const PUBLIC = path.join(OUT, "public");
const PHOTO_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 줄 안의 **굵게**, [글자](주소) 만 살린다. 나머지는 모두 이스케이프한다 */
function inline(text) {
  let out = "";
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    out += esc(text.slice(last, m.index));
    if (m[1] !== undefined) out += `<strong>${esc(m[1])}</strong>`;
    else {
      const url = m[3];
      const safe = /^(https?:|mailto:)/i.test(url) ? url : "#";
      out += `<a href="${esc(safe)}"${/^https?:/i.test(url) ? ' rel="noopener" target="_blank"' : ""}>${esc(m[2])}</a>`;
    }
    last = re.lastIndex;
  }
  return out + esc(text.slice(last));
}

/** site-content.md 의 한 절(마크다운 일부)을 HTML로 */
export function markdownToHtml(md) {
  const html = [];
  let list = null, para = [];
  const endPara = () => { if (para.length) html.push(`<p>${inline(para.join(" "))}</p>`); para = []; };
  const endList = () => { if (list) html.push(`</${list}>`); list = null; };
  for (const raw of md.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    const h = line.match(/^###\s+(.*)$/);
    const li = line.match(/^\s*([-*]|\d+\.)\s+(.*)$/);
    if (!line.trim()) { endPara(); endList(); continue; }
    if (h) { endPara(); endList(); html.push(`<h3>${inline(h[1])}</h3>`); continue; }
    if (li) {
      endPara();
      const kind = /\d+\./.test(li[1]) ? "ol" : "ul";
      if (list !== kind) { endList(); html.push(`<${kind}>`); list = kind; }
      html.push(`<li>${inline(li[2])}</li>`);
      continue;
    }
    endList();
    para.push(line.trim());
  }
  endPara(); endList();
  return html.join("\n");
}

/** site-content.md → { 제목: 내용 }. "(예: …)" 처럼 괄호로 시작하는 안내문만 있는 절은 빈 절로 본다 */
export function parseContent(text) {
  const body = text.replace(/^>.*$/gm, "");
  const sections = {};
  for (const m of body.matchAll(/^## (.+)\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)) {
    const content = m[2].trim();
    sections[m[1].trim()] = content.startsWith("(") ? "" : content;
  }
  return sections;
}

const SECTION_IDS = { "소개": "about", "연구 분야": "research", "강의": "teaching", "논문·저서": "publications", "연락처": "contact" };

function firebaseConfigFromAdmin(adminHtml) {
  const block = adminHtml.match(/const firebaseConfig = (\{[\s\S]*?\});/)?.[1];
  if (!block || /YOUR_[A-Z_]+/.test(block)) return null;
  // admin/index.html 의 객체 표기(따옴표 없는 키)를 JSON 으로 바꾼다
  try { return JSON.parse(block.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":').replace(/'/g, '"').replace(/,\s*}/, "}")); } catch { return null; }
}

async function writeRules(email) {
  const template = await readFile(path.join(ROOT, "firestore.rules"), "utf-8");
  // 주석이 아니라 isAdmin() 안의 비교식만 바꾼다
  const rules = template.replace(/(request\.auth\.token\.email == )'YOUR_EMAIL@gmail\.com'/, `$1'${email}'`);
  if (rules === template) throw new Error("firestore.rules 에서 isAdmin() 의 'YOUR_EMAIL@gmail.com' 을 찾지 못했습니다. 규칙 파일을 확인하세요.");
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, "firestore.rules"), rules, "utf-8");
}

export async function buildRulesOnly() {
  const email = ((await readProfile())["관리자 이메일"] ?? "").trim();
  if (!/^[^@\s'"]+@[^@\s'"]+\.[^@\s'"]+$/.test(email)) {
    console.log("✖ 필요: profile.md 의 '관리자 이메일' (관리자 페이지에 로그인할 구글 계정)");
    process.exitCode = 1;
    return null;
  }
  await rm(PUBLIC, { recursive: true, force: true });
  await writeRules(email);
  await writeFile(path.join(OUT, "firebase.json"), JSON.stringify({ firestore: { rules: "firestore.rules" } }, null, 2) + "\n", "utf-8");
  console.log("[완성] site/firestore.rules (규칙만). 올리기: node --env-file=.env scripts/deploy-site.mjs --rules-only");
  return { rules: true };
}

export async function buildSite({ check = false } = {}) {
  const profile = await readProfile();
  const contentText = await readFile(path.join(ROOT, "site-content.md"), "utf-8").catch(() => "");
  const sections = parseContent(contentText);
  const adminHtml = await readFile(path.join(ROOT, "admin", "index.html"), "utf-8");
  const firebaseConfig = firebaseConfigFromAdmin(adminHtml);
  const email = (profile["관리자 이메일"] ?? "").trim();
  const assets = (await readdir(path.join(ROOT, "site-assets")).catch(() => []));
  const photo = assets.find((f) => /^photo\.[a-z]+$/i.test(f) && PHOTO_EXTS.includes(path.extname(f).toLowerCase()));

  const missing = [];
  if (!profile["이름"]) missing.push("profile.md 의 '이름'");
  if (!Object.values(sections).some(Boolean)) missing.push("site-content.md 의 내용 (한 절 이상)");
  const later = [];
  if (!firebaseConfig) later.push("admin/index.html 의 firebaseConfig (없으면 '글' 영역과 관리자 페이지가 아직 동작하지 않음)");
  if (!email) later.push("profile.md 의 '관리자 이메일' (없으면 Firestore 규칙을 만들지 않음)");
  else if (!/^[^@\s'"]+@[^@\s'"]+\.[^@\s'"]+$/.test(email)) missing.push(`profile.md 의 '관리자 이메일' 형식이 이상함: ${email}`);

  if (check || missing.length) {
    missing.forEach((m) => console.log(`✖ 필요: ${m}`));
    later.forEach((m) => console.log(`· 나중에: ${m}`));
    if (!missing.length && !later.length) console.log("만들 준비가 됐습니다.");
    if (missing.length) process.exitCode = 1;
    return null;
  }

  const name = profile["이름"];
  const affil = profile["소속"] ?? "";
  const nav = Object.entries(SECTION_IDS).filter(([t]) => sections[t]).map(([t, id]) => `<a href="#${id}">${esc(t)}</a>`);
  nav.push('<a href="#posts" id="nav-posts" hidden>글</a>');
  const blocks = Object.entries(SECTION_IDS).filter(([t]) => sections[t])
    .map(([t, id]) => `    <section class="block" id="${id}">\n        <h2>${esc(t)}</h2>\n${markdownToHtml(sections[t])}\n    </section>`);
  // 정해진 절 말고 교수님이 더한 절도 그대로 싣는다
  for (const [t, c] of Object.entries(sections)) {
    if (!c || t === "한 줄 소개" || t in SECTION_IDS) continue;
    blocks.push(`    <section class="block">\n        <h2>${esc(t)}</h2>\n${markdownToHtml(c)}\n    </section>`);
  }
  const tagline = sections["한 줄 소개"] ? sections["한 줄 소개"].split("\n")[0] : "";
  const fill = (tpl) => tpl
    .replaceAll("{{NAME}}", esc(name))
    .replaceAll("{{AFFIL_TITLE}}", affil ? ` — ${esc(affil)}` : "")
    .replaceAll("{{AFFIL}}", esc(affil))
    .replaceAll("{{DESCRIPTION}}", esc(tagline || `${name} ${affil}`.trim()))
    .replaceAll("{{TAGLINE}}", tagline ? `<p class="tagline">${inline(tagline)}</p>` : "")
    .replaceAll("{{PHOTO}}", photo ? `<img src="${esc(photo)}" alt="${esc(name)} 사진">` : "")
    .replaceAll("{{NAV}}", nav.join(""))
    .replaceAll("{{SECTIONS}}", blocks.join("\n\n"))
    .replaceAll("{{YEAR}}", String(new Date().getFullYear()))
    .replaceAll("{{FIREBASE_CONFIG}}", firebaseConfig ? JSON.stringify(firebaseConfig) : "null");

  await rm(PUBLIC, { recursive: true, force: true });
  await mkdir(PUBLIC, { recursive: true });
  for (const f of ["index.html", "post.html"]) await writeFile(path.join(PUBLIC, f), fill(await readFile(path.join(TEMPLATE, f), "utf-8")), "utf-8");
  for (const f of ["style.css", "site.js"]) await copyFile(path.join(TEMPLATE, f), path.join(PUBLIC, f));
  if (photo) await copyFile(path.join(ROOT, "site-assets", photo), path.join(PUBLIC, photo));
  const adminFile = profile["설치 파일"] || "knowledge-admin.html";
  if (firebaseConfig) await writeFile(path.join(PUBLIC, adminFile), adminHtml.replace(/const SITE_NAME = '[^']*';/, `const SITE_NAME = ${JSON.stringify(name)};`), "utf-8");

  // Firebase 배포 설정. 규칙은 관리자 이메일이 있을 때만 만든다
  const firebaseJson = {
    hosting: { public: "public", ignore: ["**/.*"], headers: [{ source: `/${adminFile}`, headers: [{ key: "X-Robots-Tag", value: "noindex" }] }] },
  };
  if (email) {
    await writeRules(email);
    firebaseJson.firestore = { rules: "firestore.rules" };
  } else {
    await rm(path.join(OUT, "firestore.rules"), { force: true });
  }
  await writeFile(path.join(OUT, "firebase.json"), JSON.stringify(firebaseJson, null, 2) + "\n", "utf-8");

  const files = (await readdir(PUBLIC)).sort();
  later.forEach((m) => console.log(`· 나중에: ${m}`));
  console.log(`[완성] site/public/ — ${files.join(", ")}`);
  console.log(`       나온 절: ${Object.keys(SECTION_IDS).filter((t) => sections[t]).join(", ") || "(없음)"}${photo ? " · 사진 있음" : ""}`);
  console.log("미리 보기: npx serve site/public  →  http://localhost:3000");
  return { files, firebaseConfig: !!firebaseConfig, rules: !!email };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--rules-only")) await buildRulesOnly();
  else await buildSite({ check: process.argv.includes("--check") });
}
