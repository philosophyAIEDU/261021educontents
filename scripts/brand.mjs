// brand.md 의 "- 항목: 값" 줄을 읽는다. 다른 스크립트가 불러 쓴다. (읽기 전용)
//
//   node scripts/brand.mjs        읽은 값을 보여준다

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function readBrand() {
  let text = "";
  try {
    text = await readFile(path.join(ROOT, "brand.md"), "utf-8");
  } catch {
    return {};
  }
  const brand = {};
  // "## 적는 법" 아래의 예시 표는 읽지 않는다
  const settings = text.split(/^## 적는 법/m)[0];
  for (const m of settings.matchAll(/^- ([^:\n]+):[ \t]*(.*)$/gm)) {
    const value = m[2].trim();
    brand[m[1].trim()] = value.startsWith("(") ? "" : value;
  }
  return brand;
}

/** 내 콘텐츠로 인정하는 주소 목록 (사이트 주소 + RSS 주소 + 내 다른 주소). 경로까지 적으면 그 경로 아래만 인정한다. */
export function ownDomains(brand) {
  const raw = [brand["사이트 주소"], brand["RSS 주소"], ...(brand["내 다른 주소"] ?? "").split(",")];
  const out = new Set();
  for (const r of raw) {
    const v = (r ?? "").trim();
    if (!v) continue;
    try {
      const u = new URL(v.includes("://") ? v : `https://${v}`);
      const host = u.hostname.replace(/^www\./, "").toLowerCase();
      // RSS 주소는 파일 경로(/rss.xml 등)이므로 도메인만 쓴다
      const prefix = r === brand["RSS 주소"] ? "" : u.pathname.replace(/\/+$/, "");
      out.add(host + prefix);
    } catch {}
  }
  return [...out];
}

export function isOwnUrl(url, domains) {
  let host, pathname;
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, "").toLowerCase();
    pathname = u.pathname;
  } catch {
    return false;
  }
  return domains.some((d) => {
    const [dHost, ...rest] = d.split("/");
    const prefix = rest.length ? `/${rest.join("/")}` : "";
    const hostOk = host === dHost || host.endsWith(`.${dHost}`);
    return hostOk && (!prefix || pathname === prefix || pathname.startsWith(`${prefix}/`));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const brand = await readBrand();
  for (const [k, v] of Object.entries(brand)) console.log(`${k}: ${v || "(비어 있음)"}`);
  console.log(`\n내 콘텐츠로 인정하는 도메인: ${ownDomains(brand).join(", ") || "(없음 — brand.md의 사이트 주소를 채우세요)"}`);
}
