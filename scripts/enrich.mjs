// 유튜브 링크로 발행일·조회수를 가져와 processed/ JSON의 태그를 채운다.
//
// 사용법
//   node --env-file=.env scripts/enrich.mjs --id script-01 --url https://youtu.be/XXXXXXXXXXX
//   node --env-file=.env scripts/enrich.mjs --id script-01        (JSON에 youtube_url이 이미 있을 때 조회수 갱신)
//   node --env-file=.env scripts/enrich.mjs --all                 (youtube_url이 있는 모든 문서 갱신)
//
// 필요: .env 의 YOUTUBE_API_KEY (YouTube Data API v3, git에 올리지 않는다)
// 채우는 값: tags.published_at(YYYY-MM-DD, 한국 시간), views, tags.performance_grade(상/중/하)
// 등급 기준: 100 미만 하 / 100 이상 1000 미만 중 / 1000 이상 상

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROCESSED = path.join(ROOT, "processed");
const REQUIRED_TAGS = ["category", "format", "target_audience", "performance_grade", "published_at", "key_message"];

export function gradeFromViews(views) {
  if (views >= 1000) return "상";
  if (views >= 100) return "중";
  return "하";
}

export function parseVideoId(input) {
  if (/^[\w-]{11}$/.test(input)) return input;
  try {
    const u = new URL(input);
    if (u.hostname === "youtu.be") return u.pathname.slice(1).slice(0, 11);
    if (u.hostname.endsWith("youtube.com")) {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const m = u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{11})/);
      if (m) return m[1];
    }
  } catch {}
  throw new Error(`유튜브 링크에서 영상 ID를 찾지 못했습니다: ${input}`);
}

async function fetchVideo(id) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY가 없습니다. .env를 확인하고 --env-file=.env 로 실행하세요.");
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${id}&key=${key}`;
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(`YouTube API 오류 ${res.status}: ${body.error?.message ?? ""}`);
  const item = body.items?.[0];
  if (!item) throw new Error(`영상을 찾지 못했습니다(비공개이거나 잘못된 ID): ${id}`);
  const kstDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date(item.snippet.publishedAt));
  return { title: item.snippet.title, publishedAt: kstDate, views: Number(item.statistics.viewCount ?? 0) };
}

function refreshStatus(doc) {
  const missing = REQUIRED_TAGS.filter((k) => doc.tags[k] === null || doc.tags[k] === undefined || doc.tags[k] === "");
  doc.missing_tags = missing;
  doc.upload_ready = missing.length === 0;
}

async function enrich(file, urlOverride) {
  const p = path.join(PROCESSED, file);
  const doc = JSON.parse(await readFile(p, "utf-8"));
  const url = urlOverride ?? doc.youtube_url;
  if (!url) return false;
  const id = parseVideoId(url);
  const v = await fetchVideo(id);
  doc.youtube_url = url;
  doc.youtube_id = id;
  doc.tags.published_at = v.publishedAt;
  doc.views = v.views;
  doc.views_fetched_at = new Date().toISOString();
  doc.tags.performance_grade = gradeFromViews(v.views);
  refreshStatus(doc);
  await writeFile(p, JSON.stringify(doc, null, 2), "utf-8");
  console.log(`[갱신] ${doc.id}: 발행일 ${v.publishedAt}, 조회수 ${v.views.toLocaleString()}, 등급 ${doc.tags.performance_grade}, 업로드가능 ${doc.upload_ready}`);
  console.log(`        영상 제목: ${v.title}`);
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const val = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
  const id = val("--id");
  const url = val("--url");
  const files = (await readdir(PROCESSED)).filter((f) => f.endsWith(".json"));
  if (!args.includes("--all") && !id) {
    console.error("--id <문서id> [--url <유튜브 링크>] 또는 --all 을 지정하세요.");
    process.exit(1);
  }
  let count = 0;
  for (const f of files) {
    const doc = JSON.parse(await readFile(path.join(PROCESSED, f), "utf-8"));
    if (id && doc.id !== id) continue;
    try {
      if (await enrich(f, id ? url : null)) count++;
    } catch (e) {
      console.error(`[실패] ${doc.id}: ${e.message}`);
      process.exitCode = 1;
    }
  }
  if (!count) console.log("갱신한 문서가 없습니다 (youtube_url이 없거나 대상 없음).");
}
