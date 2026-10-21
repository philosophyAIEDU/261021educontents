// 내 콘텐츠를 가져와 raw/ 에 텍스트 파일(.txt)과 정보 파일(.txt.meta.json)로 저장한다.
// 그다음 /ingest 가 정리·태깅해서 Contents Input 에 올린다.
//
// 사용법 (프로젝트 폴더에서)
//   node scripts/extract.mjs --youtube <영상 링크>                   영상 1개의 자막
//   node scripts/extract.mjs --youtube <내 채널 링크> --limit 5      채널의 최근 영상 5개
//   node scripts/extract.mjs --url <내 사이트 글 주소>               글 1개
//   node scripts/extract.mjs --rss <내 RSS 주소> --limit 10          RSS 의 최근 글 10개
//   node scripts/extract.mjs --repo site-repo --limit 50             내 사이트 저장소의 마크다운 글
//   node scripts/extract.mjs --auto                                  brand.md 에 적힌 곳(유튜브·RSS·저장소)에서 모두
//   --list  저장하지 않고 가져올 목록만 보여준다
//
// 규칙 3: brand.md 에 적힌 내 주소(사이트·RSS·내 다른 주소·유튜브 채널)의 콘텐츠만 가져온다.
// 이미 가져왔거나 processed/ 에 있는 것은 건너뛴다. raw/ 의 기존 파일은 수정하지 않는다.
// 유튜브는 yt-dlp 가 필요하다 (없으면 설치 방법을 알려준다). API 키는 필요 없다.

import { readdir, readFile, writeFile, mkdtemp, rm, access, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, readBrand, ownDomains, isOwnUrl } from "./brand.mjs";

const RAW = path.join(ROOT, "raw");
const PROCESSED = path.join(ROOT, "processed");

// ---------- 텍스트 정리 ----------
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", middot: "·", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—" };
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function cleanLines(lines) {
  const out = [];
  for (let line of lines) {
    line = line.replace(/\[[^\]]{1,20}\]/g, " ").replace(/^>>\s*/, "").replace(/\s+/g, " ").trim();
    if (!line || line === out[out.length - 1]) continue;
    out.push(line);
  }
  return out.join("\n");
}

export function htmlToText(html) {
  let h = html.replace(/<!--[\s\S]*?-->/g, "");
  const pick = (tag) => h.match(new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, "i"))?.[0];
  h = pick("article") ?? pick("main") ?? pick("body") ?? h;
  h = h.replace(/<(script|style|noscript|nav|header|footer|aside|form|svg|button|iframe)[\s>][\s\S]*?<\/\1>/gi, " ");
  h = h.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h[1-6]|li|blockquote|pre|tr|section)>/gi, "\n").replace(/<li[\s>]/gi, "\n- $&");
  h = decodeEntities(h.replace(/<[^>]+>/g, ""));
  return h.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}

function htmlMeta(html) {
  const meta = (prop) => {
    const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${prop}["'][^>]*>`, "i");
    return html.match(re)?.[0].match(/content=["']([^"']*)["']/i)?.[1];
  };
  const title = meta("og:title") ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const date = meta("article:published_time") ?? meta("datePublished") ?? html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1] ?? html.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1];
  return { title: title ? decodeEntities(title).trim() : "", published_at: toDate(date) };
}

export function toDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(d);
}

export function slugify(s) {
  return (s || "untitled").normalize("NFC").replace(/\.[a-z0-9]+$/i, "").replace(/[^\w가-힣-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "untitled";
}

// ---------- 이미 가져온 것 ----------
async function readJsonFiles(dir, suffix) {
  let files = [];
  try { files = (await readdir(dir)).filter((f) => f.endsWith(suffix)); } catch { return []; }
  const out = [];
  for (const f of files) {
    try { out.push({ file: f, data: JSON.parse(await readFile(path.join(dir, f), "utf-8")) }); } catch {}
  }
  return out;
}

async function knownSources() {
  const known = new Set();
  const add = (d = {}) => ["source_url", "youtube_url", "youtube_id", "repo_path", "source_file"].forEach((k) => d[k] && known.add(String(d[k])));
  for (const dir of [PROCESSED, path.join(PROCESSED, "_hold"), path.join(PROCESSED, "_removed")]) (await readJsonFiles(dir, ".json")).forEach((x) => add(x.data));
  for (const dir of [RAW, path.join(RAW, "hold")]) {
    (await readJsonFiles(dir, ".meta.json")).forEach((x) => add(x.data));
    try { (await readdir(dir)).forEach((f) => known.add(f)); } catch {}
  }
  return known;
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function saveRaw(name, text, meta, opts) {
  const file = `${name}.txt`;
  if (opts.known.has(file) || (await exists(path.join(RAW, file)))) {
    console.log(`[건너뜀] 이미 있음: raw/${file}`);
    return false;
  }
  if (text.replace(/\s/g, "").length < 200) console.warn(`[주의] ${file}: 본문이 매우 짧습니다 (${text.length}자). 자막이 없거나 글이 화면에서만 그려지는 사이트일 수 있습니다.`);
  if (opts.list) {
    console.log(`[가져올 것] raw/${file} — ${meta.title || ""} (${meta.published_at ?? "발행일 모름"})`);
    return true;
  }
  await writeFile(path.join(RAW, file), text + "\n", "utf-8");
  await writeFile(path.join(RAW, `${file}.meta.json`), JSON.stringify({ ...meta, extracted_at: new Date().toISOString() }, null, 2), "utf-8");
  opts.known.add(file);
  console.log(`[저장] raw/${file} — ${meta.title || ""} (${meta.published_at ?? "발행일 모름"}${meta.views !== undefined ? `, 조회수 ${meta.views.toLocaleString()}` : ""})`);
  return true;
}

// ---------- 유튜브 (yt-dlp) ----------
function findYtDlp() {
  const candidates = [["yt-dlp"], ["python", "-m", "yt_dlp"], ["python3", "-m", "yt_dlp"], ["py", "-m", "yt_dlp"]];
  for (const c of candidates) {
    const r = spawnSync(c[0], [...c.slice(1), "--version"], { encoding: "utf-8" });
    if (r.status === 0) return c;
  }
  throw new Error(
    "yt-dlp 가 없습니다. 유튜브 자막을 가져오려면 한 번만 설치하세요.\n" +
    "  Windows: winget install yt-dlp    Mac: brew install yt-dlp    (또는 pip install yt-dlp)\n" +
    "  설치가 어렵다면: 유튜브 스튜디오 > 자막 > 점 세 개 > 다운로드(.srt)로 받은 파일을 raw/ 에 넣어도 됩니다."
  );
}

function ytdlp(cmd, args) {
  const r = spawnSync(cmd[0], [...cmd.slice(1), ...args], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`yt-dlp 오류: ${(r.stderr || r.stdout || "").trim().split("\n").slice(-3).join(" / ")}`);
  return r.stdout;
}

export function json3ToText(j) {
  const lines = [];
  for (const ev of j.events ?? []) {
    if (!ev.segs) continue;
    lines.push(ev.segs.map((s) => s.utf8 ?? "").join(""));
  }
  return cleanLines(lines);
}

export function myYoutube(brand) {
  const v = (brand["유튜브 채널"] || process.env.MY_YOUTUBE_CHANNEL_ID || "").trim();
  return {
    handle: v.match(/@([\w.-]+)/)?.[1]?.toLowerCase() ?? null,
    channelId: v.match(/(UC[\w-]{22})/)?.[1] ?? null,
    url: v,
  };
}

export function isMyChannel(info, me) {
  const handle = String(info.uploader_id ?? "").replace(/^@/, "").toLowerCase();
  const urlHandle = String(info.uploader_url ?? info.channel_url ?? "").match(/@([\w.-]+)/)?.[1]?.toLowerCase();
  return (me.channelId && info.channel_id === me.channelId) || (me.handle && (handle === me.handle || urlHandle === me.handle));
}

async function youtubeVideo(cmd, url, me, opts) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "ytx-"));
  try {
    ytdlp(cmd, ["--skip-download", "--no-playlist", "--write-info-json", "--write-subs", "--write-auto-subs", "--sub-langs", "ko,ko-KR,ko-orig", "--sub-format", "json3", "-o", path.join(tmp, "%(id)s.%(ext)s"), url]);
    const files = await readdir(tmp);
    const infoFile = files.find((f) => f.endsWith(".info.json"));
    if (!infoFile) throw new Error("영상 정보를 받지 못했습니다.");
    const info = JSON.parse(await readFile(path.join(tmp, infoFile), "utf-8"));
    if (!isMyChannel(info, me)) {
      console.error(`[멈춤] 내 채널 영상이 아닙니다: ${info.title} (${info.channel ?? info.uploader ?? "채널 모름"}). 규칙 3에 따라 가져오지 않습니다.`);
      return false;
    }
    const pageUrl = info.webpage_url ?? url;
    if (opts.known.has(pageUrl) || opts.known.has(info.id)) {
      console.log(`[건너뜀] 이미 가져온 영상: ${info.title}`);
      return false;
    }
    const sub = ["ko", "ko-KR", "ko-orig"].map((l) => `${info.id}.${l}.json3`).find((f) => files.includes(f)) ?? files.find((f) => f.endsWith(".json3"));
    if (!sub) {
      console.error(`[실패] 한국어 자막이 없습니다: ${info.title}. 유튜브 스튜디오에서 자막(.srt)을 받아 raw/ 에 넣어 주세요.`);
      return false;
    }
    const text = json3ToText(JSON.parse(await readFile(path.join(tmp, sub), "utf-8")));
    return saveRaw(`yt-${info.id}`, text, {
      source: "youtube",
      format_hint: "유튜브 대본",
      title: info.title,
      youtube_url: pageUrl,
      youtube_id: info.id,
      published_at: toDate(info.upload_date),
      views: Number(info.view_count ?? 0),
      duration_sec: info.duration ?? null,
      subtitle: sub.includes("-orig") ? "자동 자막" : "자막",
    }, opts);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function youtube(url, me, opts) {
  if (!me.handle && !me.channelId) throw new Error("brand.md 의 '유튜브 채널'에 내 채널 주소(예: https://www.youtube.com/@내핸들)를 먼저 적어 주세요. 내 영상인지 확인하는 기준입니다.");
  const cmd = findYtDlp();
  if (/^@[\w.-]+$/.test(url.trim())) url = `https://www.youtube.com/${url.trim()}`;
  else if (/^UC[\w-]{22}$/.test(url.trim())) url = `https://www.youtube.com/channel/${url.trim()}`;
  const isChannel = /youtube\.com\/(@|channel\/|c\/|user\/)/.test(url) && !/watch\?|shorts\//.test(url);
  if (!isChannel) return (await youtubeVideo(cmd, url, me, opts)) ? 1 : 0;
  const base = url.replace(/\/(videos|shorts|streams|featured)?\/?$/, "");
  const ids = ytdlp(cmd, ["--flat-playlist", "--print", "id", "--playlist-end", String(opts.limit), `${base}/videos`]).split("\n").map((s) => s.trim()).filter(Boolean);
  console.log(`채널에서 최근 영상 ${ids.length}개를 확인합니다.`);
  let n = 0;
  for (const id of ids) {
    if (opts.known.has(id)) { console.log(`[건너뜀] 이미 가져온 영상: ${id}`); continue; }
    try { if (await youtubeVideo(cmd, `https://www.youtube.com/watch?v=${id}`, me, opts)) n++; }
    catch (e) { console.error(`[실패] ${id}: ${e.message}`); process.exitCode = 1; }
  }
  return n;
}

// ---------- 웹 글 / RSS ----------
async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (contents-studio extract)" } });
  if (!res.ok) throw new Error(`${url} 을(를) 열지 못했습니다 (HTTP ${res.status})`);
  return res.text();
}

function checkOwn(url, domains) {
  if (!domains.length) throw new Error("brand.md 의 '사이트 주소'를 먼저 채워 주세요. 내 글인지 확인하는 기준입니다 (/start).");
  if (!isOwnUrl(url, domains)) throw new Error(`내 주소가 아닙니다: ${url}\n  내 글이 맞다면 brand.md 의 '내 다른 주소'에 이 도메인을 추가하세요. (규칙 3: 타인의 글은 가져오지 않습니다)`);
}

async function webPage(url, domains, opts, fromFeed = {}) {
  checkOwn(url, domains);
  if (opts.known.has(url)) { console.log(`[건너뜀] 이미 가져온 글: ${url}`); return false; }
  let text = fromFeed.text ?? "";
  let meta = { title: fromFeed.title ?? "", published_at: fromFeed.published_at ?? null };
  if (text.replace(/\s/g, "").length < 300) {
    const html = await fetchText(url);
    const m = htmlMeta(html);
    text = htmlToText(html);
    meta = { title: meta.title || m.title, published_at: meta.published_at ?? m.published_at };
  }
  const slug = slugify(new URL(url).pathname.split("/").filter(Boolean).pop() || meta.title);
  return saveRaw(`web-${slug}`, text, { source: "web", format_hint: fromFeed.format_hint ?? "", title: meta.title, source_url: url, published_at: meta.published_at }, opts);
}

export function parseFeed(xml) {
  const unwrap = (s) => (s ?? "").replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1").trim();
  const tag = (block, name) => unwrap(block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1]);
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  return blocks.map((b) => {
    const link = tag(b, "link") || b.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || "";
    const body = tag(b, "content:encoded") || tag(b, "content") || tag(b, "description") || tag(b, "summary");
    return {
      url: decodeEntities(link).trim(),
      title: decodeEntities(tag(b, "title").replace(/<[^>]+>/g, "")),
      published_at: toDate(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date")),
      text: htmlToText(`<body>${decodeEntities(body)}</body>`),
    };
  });
}

async function rss(url, domains, opts) {
  checkOwn(url, domains);
  const items = parseFeed(await fetchText(url)).slice(0, opts.limit);
  console.log(`RSS에서 글 ${items.length}개를 확인합니다.`);
  let n = 0;
  for (const it of items) {
    if (!it.url) continue;
    try { if (await webPage(it.url, domains, opts, it)) n++; }
    catch (e) { console.error(`[실패] ${it.url}: ${e.message}`); process.exitCode = 1; }
  }
  return n;
}

// ---------- 내 사이트 저장소의 마크다운 글 ----------
const SKIP_DIRS = new Set(["node_modules", ".git", ".github", ".next", "dist", "build", "out", ".cache", "public", "static", "vendor", "_site", ".vercel"]);
async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) await walk(path.join(dir, e.name), out); }
    else if (/\.(md|mdx|markdown)$/i.test(e.name) && !/^(readme|changelog|license|contributing|code_of_conduct)/i.test(e.name)) out.push(path.join(dir, e.name));
  }
  return out;
}

export function parseFrontMatter(src) {
  const m = src.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: null, body: src };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  return { data, body: src.slice(m[0].length) };
}

export function markdownToText(md) {
  return md
    .replace(/```[\s\S]*?```/g, "\n")
    .replace(/^\s*(import|export)\s.*$/gm, "")
    .replace(/<[^>\n]+>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/(\*\*|__|`)/g, "")
    .replace(/^\s*>\s?/gm, "")
    .split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
}

async function repo(dir, opts) {
  const abs = path.resolve(ROOT, dir);
  if (!(await exists(abs)) || !(await stat(abs)).isDirectory()) throw new Error(`사이트 저장소 폴더가 없습니다: ${dir} (/site 가 내려받습니다)`);
  const files = await walk(abs);
  const posts = [];
  for (const f of files) {
    const { data, body } = parseFrontMatter(await readFile(f, "utf-8"));
    if (!data || (!data.title && !data.date) || /^(true|yes)$/i.test(data.draft ?? "")) continue; // 글(front matter 있는 문서)만
    const rel = path.relative(ROOT, f).split(path.sep).join("/");
    const date = toDate(data.date ?? data.pubDate ?? data.publishedAt ?? data.published ?? path.basename(f).match(/^(\d{4}-\d{2}-\d{2})/)?.[1]);
    posts.push({ rel, data, body, date });
  }
  posts.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  console.log(`저장소에서 글 ${posts.length}개를 찾았습니다 (최근 ${Math.min(opts.limit, posts.length)}개 처리).`);
  let n = 0;
  for (const p of posts.slice(0, opts.limit)) {
    if (opts.known.has(p.rel)) { console.log(`[건너뜀] 이미 가져온 글: ${p.rel}`); continue; }
    const name = `repo-${slugify(path.basename(p.rel).replace(/^\d{4}-\d{2}-\d{2}-/, ""))}`;
    if (await saveRaw(name, markdownToText(p.body), { source: "repo", format_hint: "블로그 글", title: p.data.title ?? "", repo_path: p.rel, published_at: p.date }, opts)) n++;
  }
  return n;
}

// ---------- 실행 ----------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const val = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
  const brand = await readBrand();
  const domains = ownDomains(brand);
  const opts = { list: args.includes("--list"), limit: Number(val("--limit") ?? 10), known: await knownSources() };
  const jobs = [];
  if (val("--youtube")) jobs.push(["유튜브", () => youtube(val("--youtube"), myYoutube(brand), opts)]);
  if (val("--url")) jobs.push(["웹 글", async () => ((await webPage(val("--url"), domains, opts)) ? 1 : 0)]);
  if (val("--rss")) jobs.push(["RSS", () => rss(val("--rss"), domains, opts)]);
  if (val("--repo")) jobs.push(["사이트 저장소", () => repo(val("--repo"), opts)]);
  if (args.includes("--auto")) {
    if (brand["유튜브 채널"]) jobs.push(["유튜브", () => youtube(brand["유튜브 채널"], myYoutube(brand), opts)]);
    if (brand["RSS 주소"]) jobs.push(["RSS", () => rss(brand["RSS 주소"], domains, opts)]);
    const repoDir = brand["사이트 저장소 폴더"] || "site-repo";
    if (await exists(path.resolve(ROOT, repoDir))) jobs.push(["사이트 저장소", () => repo(repoDir, opts)]);
    if (!jobs.length) console.log("brand.md 에 가져올 곳(유튜브 채널, RSS 주소, 사이트 저장소)이 없습니다.");
  }
  if (!jobs.length && !args.includes("--auto")) {
    console.error("가져올 곳을 지정하세요: --youtube <링크> | --url <글 주소> | --rss <RSS 주소> | --repo <폴더> | --auto  (자세한 사용법은 파일 맨 위)");
    process.exit(1);
  }
  let total = 0;
  for (const [name, job] of jobs) {
    try { total += await job(); }
    catch (e) { console.error(`[실패] ${name}: ${e.message}`); process.exitCode = 1; }
  }
  console.log(`\n${opts.list ? "가져올" : "새로 가져온"} 콘텐츠: ${total}개${total && !opts.list ? " → 이제 /ingest 로 정리해서 올리세요." : ""}`);
}
