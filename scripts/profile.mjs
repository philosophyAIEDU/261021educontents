// profile.md 의 "- 항목: 값" 줄을 읽는다. 다른 스크립트가 불러 쓴다. (읽기 전용)
//
//   node scripts/profile.mjs        읽은 값을 보여준다

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function readProfile() {
  let text = "";
  try {
    text = await readFile(path.join(ROOT, "profile.md"), "utf-8");
  } catch {
    return {};
  }
  const profile = {};
  // "## 적는 법" 아래의 예시 표는 읽지 않는다
  const settings = text.split(/^## 적는 법/m)[0];
  for (const m of settings.matchAll(/^- ([^:\n]+):[ \t]*(.*)$/gm)) {
    const value = m[2].trim();
    profile[m[1].trim()] = value.startsWith("(") ? "" : value;
  }
  return profile;
}

/** 관리자 페이지를 내 사이트에 올리는가 (기본) 아니면 내 컴퓨터에서만 여는가 */
export function viewsOnLocal(profile) {
  return /컴퓨터|로컬|local/i.test(profile["관리자 페이지 보는 곳"] ?? "");
}

/** 내 자료로 인정하는 주소 목록 (사이트 주소 + RSS 주소 + 내 다른 주소). 경로까지 적으면 그 경로 아래만 인정한다. */
export function ownDomains(profile) {
  const raw = [profile["사이트 주소"], profile["RSS 주소"], ...(profile["내 다른 주소"] ?? "").split(",")];
  const out = new Set();
  for (const r of raw) {
    const v = (r ?? "").trim();
    if (!v) continue;
    try {
      const u = new URL(v.includes("://") ? v : `https://${v}`);
      const host = u.hostname.replace(/^www\./, "").toLowerCase();
      // RSS 주소는 파일 경로(/rss.xml 등)이므로 도메인만 쓴다
      const prefix = r === profile["RSS 주소"] ? "" : u.pathname.replace(/\/+$/, "");
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
  const profile = await readProfile();
  for (const [k, v] of Object.entries(profile)) console.log(`${k}: ${v || "(비어 있음)"}`);
  console.log(`\n내 자료로 인정하는 주소: ${ownDomains(profile).join(", ") || "(없음 — profile.md의 사이트 주소나 내 다른 주소를 채우세요)"}`);
}
