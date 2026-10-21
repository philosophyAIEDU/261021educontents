// 관리자 페이지(admin/index.html)를 내 사이트 저장소에 복사한다. 기본은 미리보기이며 --commit 을 붙여야 복사한다.
// git 커밋·푸시는 하지 않는다 (/site 스킬이 사용자 확인을 받고 한다).
//
//   node scripts/install-admin.mjs            사이트 종류와 설치 위치만 보여준다
//   node scripts/install-admin.mjs --commit   실제로 복사한다
//   --repo <폴더>   사이트 저장소 폴더 (기본: brand.md 의 '사이트 저장소 폴더', 없으면 site-repo)
//   --file <이름>   설치 파일 이름 (기본: brand.md 의 '설치 파일', 없으면 contents-admin.html)
//   --dir <폴더>    공개 폴더를 직접 지정 (자동 판별이 틀렸을 때, 예: public)

import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, readBrand } from "./brand.mjs";

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

/** 사이트 종류와, 파일을 넣으면 그대로 공개되는 폴더(공개 폴더)를 판별한다 */
export async function detectSite(repoDir) {
  const has = (p) => exists(path.join(repoDir, p));
  let deps = {};
  if (await has("package.json")) {
    try {
      const pkg = JSON.parse(await readFile(path.join(repoDir, "package.json"), "utf-8"));
      deps = { ...pkg.dependencies, ...pkg.devDependencies };
    } catch {}
  }
  const rules = [
    ["next", "Next.js", "public"],
    ["astro", "Astro", "public"],
    ["nuxt", "Nuxt", (await has("static")) && !(await has("public")) ? "static" : "public"],
    ["gatsby", "Gatsby", "static"],
    ["@sveltejs/kit", "SvelteKit", "static"],
    ["@docusaurus/core", "Docusaurus", "static"],
    ["vitepress", "VitePress", "docs/public"],
    ["react-scripts", "Create React App", "public"],
    ["vite", "Vite", "public"],
  ];
  for (const [dep, name, dir] of rules) if (deps[dep]) return { name, publicDir: dir };
  if (deps["@11ty/eleventy"]) return { name: "Eleventy", publicDir: null, note: "Eleventy는 복사 설정(passthrough)이 필요합니다. --dir 로 직접 지정하세요." };
  if ((await has("hugo.toml")) || (await has("hugo.yaml")) || ((await has("config.toml")) && (await has("content")))) return { name: "Hugo", publicDir: "static" };
  if (await has("_config.yml")) return { name: "Jekyll (GitHub Pages)", publicDir: "." };
  if (await has("index.html")) return { name: "정적 HTML 사이트", publicDir: "." };
  if (await has("docs/index.html")) return { name: "정적 HTML 사이트 (docs 폴더)", publicDir: "docs" };
  return { name: "알 수 없음", publicDir: null, note: "사이트 종류를 알아내지 못했습니다. 파일을 넣으면 그대로 공개되는 폴더를 --dir 로 지정하세요." };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const val = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
  const brand = await readBrand();
  const repoDir = path.resolve(ROOT, val("--repo") ?? (brand["사이트 저장소 폴더"] || "site-repo"));
  const fileName = val("--file") ?? (brand["설치 파일"] || "contents-admin.html");
  const commit = args.includes("--commit");

  const fail = (msg) => { console.error(msg); process.exit(1); };
  if (!/^[\w.-]+\.html$/.test(fileName)) fail(`설치 파일 이름은 영문·숫자로 된 .html 이어야 합니다: ${fileName}`);

  const src = await readFile(path.join(ROOT, "admin", "index.html"), "utf-8");
  if (/YOUR_[A-Z_]+/.test(src.match(/const firebaseConfig = \{[\s\S]*?\};/)?.[0] ?? "YOUR_")) {
    fail("admin/index.html 의 firebaseConfig 가 아직 비어 있습니다 (YOUR_...). TUTORIAL.md 6단계를 먼저 하세요.");
  }
  if (!(await exists(path.join(repoDir, ".git")))) fail(`사이트 저장소가 없습니다: ${path.relative(ROOT, repoDir) || repoDir}\n  먼저 내려받으세요: git clone <사이트 GitHub 저장소 주소> ${path.relative(ROOT, repoDir)}`);

  const site = await detectSite(repoDir);
  const publicDir = val("--dir") ?? site.publicDir;
  console.log(`사이트 종류: ${site.name}`);
  if (!publicDir) fail(site.note);
  const target = path.join(repoDir, publicDir, fileName);
  const rel = path.relative(repoDir, target).split(path.sep).join("/");
  const siteUrl = (brand["사이트 주소"] || "https://내사이트주소").replace(/\/+$/, "");
  const before = (await exists(target)) ? await readFile(target, "utf-8") : null;

  console.log(`설치 위치: ${path.relative(ROOT, repoDir)}/${rel} ${before === null ? "(새 파일)" : before === src ? "(이미 같은 내용, 바꿀 것 없음)" : "(기존 파일을 새 내용으로 바꿈)"}`);
  console.log(`배포 후 주소: ${siteUrl}/${fileName}`);
  if (!commit) {
    console.log("\n미리보기 완료. 실제로 복사하려면 --commit 을 붙이세요. (git 커밋·푸시는 따로 합니다)");
    process.exit(0);
  }
  if (before === src) process.exit(0);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, src, "utf-8");
  console.log(`[복사] ${rel}`);
  console.log("\n다음 단계: 사이트 저장소에서 커밋·푸시하면 사이트에 반영됩니다. Firebase 콘솔 > Authentication > 설정 > 승인된 도메인에 사이트 도메인을 추가해야 로그인이 됩니다.");
}
