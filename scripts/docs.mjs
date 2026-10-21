// 교수님이 가진 문서 파일(.pptx 슬라이드, .docx 워드, .hwpx 한글, .pdf)에서 글자만 뽑는다. 추가 설치 없이 동작한다.
// extract.mjs --file 이 쓴다. (읽기 전용: 원본 파일은 고치지 않는다)
//
//   .pptx  슬라이드 글자 + 발표자 노트 (노트에 교수님의 설명이 들어 있는 경우가 많다)
//   .docx  본문 문단과 표
//   .hwpx  한글 2014 이후의 새 형식. 옛 .hwp 는 읽지 못한다 → 한글에서 "다른 이름으로 저장 > .hwpx" 또는 PDF로
//   .pdf   pdftotext(poppler)가 있으면 그것으로. 없으면 Claude가 PDF를 직접 읽어 정리한다 (/ingest 0단계)

import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";
import path from "node:path";

export const DOC_EXTS = [".pptx", ".docx", ".hwpx", ".pdf"];
export const OLD_EXTS = [".hwp", ".ppt", ".doc"];
export const TEXT_EXTS = [".txt", ".md", ".srt", ".vtt"];

// ---------- zip (pptx·docx·hwpx 는 zip 안에 XML이 든 파일이다) ----------
export function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("zip 형식이 아닙니다 (파일이 손상됐거나 다른 형식일 수 있습니다)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf-8");
    p += 46 + nameLen + extraLen + commentLen;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    files.set(name, () => (method === 0 ? data : method === 8 ? inflateRawSync(data) : Buffer.alloc(0)));
  }
  return { names: [...files.keys()], read: (name) => files.get(name)?.().toString("utf-8") ?? "" };
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e.toLowerCase()] ?? m);

/** XML에서 문단(paraTag) 단위로 글자(textTag)를 모은다 */
function paragraphs(xml, paraTag, textTag) {
  const out = [];
  for (const para of xml.match(new RegExp(`<${paraTag}[\\s>][\\s\\S]*?</${paraTag}>`, "g")) ?? []) {
    const line = [...para.matchAll(new RegExp(`<${textTag}(?:\\s[^>]*)?>([^<]*)</${textTag}>`, "g"))].map((m) => decode(m[1])).join("").replace(/\s+/g, " ").trim();
    if (line) out.push(line);
  }
  return out;
}

const byNumber = (re) => (a, b) => Number(a.match(re)?.[1] ?? 0) - Number(b.match(re)?.[1] ?? 0);

// 발표 순서는 파일 이름이 아니라 presentation.xml 의 슬라이드 목록이 정한다
function slideOrder(z) {
  const rels = new Map([...z.read("ppt/_rels/presentation.xml.rels").matchAll(/<Relationship\b[^>]*>/g)]
    .map((m) => [m[0].match(/Id="([^"]+)"/)?.[1], m[0].match(/Target="([^"]+)"/)?.[1]]));
  const ordered = [...z.read("ppt/presentation.xml").matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)]
    .map((m) => rels.get(m[1])).filter(Boolean).map((t) => `ppt/${t.replace(/^\/?(ppt\/)?/, "")}`);
  const all = z.names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort(byNumber(/slide(\d+)\.xml/));
  return ordered.length ? ordered.filter((n) => all.includes(n)) : all;
}

function pptx(buf) {
  const z = unzip(buf);
  const slides = slideOrder(z);
  const parts = [];
  slides.forEach((s, i) => {
    const text = paragraphs(z.read(s), "a:p", "a:t");
    // 노트는 슬라이드의 관계 파일이 가리킨다. 관계 파일 자체가 없을 때만 같은 번호의 노트 파일을 본다
    const relFile = s.replace("slides/", "slides/_rels/") + ".rels";
    const relTarget = z.read(relFile).match(/Target="[^"]*notesSlides\/(notesSlide\d+\.xml)"/)?.[1];
    const noteFile = relTarget ? `ppt/notesSlides/${relTarget}` : z.names.includes(relFile) ? null : s.replace("slides/slide", "notesSlides/notesSlide");
    // 노트 파일의 마지막 숫자 문단은 슬라이드 번호라서 뺀다
    const notes = noteFile && z.names.includes(noteFile) ? paragraphs(z.read(noteFile), "a:p", "a:t").filter((l) => !/^\d+$/.test(l)) : [];
    parts.push(`[슬라이드 ${i + 1}]`, ...text);
    if (notes.length) parts.push(`[발표자 노트]`, ...notes);
  });
  return { text: parts.join("\n"), info: { slides: slides.length } };
}

function docx(buf) {
  const z = unzip(buf);
  return { text: paragraphs(z.read("word/document.xml"), "w:p", "w:t").join("\n"), info: {} };
}

function hwpx(buf) {
  const z = unzip(buf);
  const sections = z.names.filter((n) => /^Contents\/section\d+\.xml$/i.test(n)).sort(byNumber(/section(\d+)\.xml/i));
  return { text: sections.flatMap((s) => paragraphs(z.read(s), "hp:p", "hp:t")).join("\n"), info: {} };
}

function pdf(file) {
  const r = spawnSync("pdftotext", ["-enc", "UTF-8", "-layout", file, "-"], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) {
    const e = new Error("pdftotext 가 없어 PDF를 바로 읽지 못했습니다. Claude가 PDF를 직접 읽어 raw/ 에 텍스트로 정리하면 됩니다 (/ingest 0단계).");
    e.code = "NO_PDFTOTEXT";
    throw e;
  }
  const lines = r.stdout.replace(/\f/g, "\n").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  return { text: lines.join("\n"), info: {} };
}

// 자막 파일은 번호·시간 표시를 지우고 말한 내용만 남긴다
export function subtitleToText(src) {
  return src.replace(/\r/g, "").split("\n")
    .filter((l) => l.trim() && !/^\d+$/.test(l.trim()) && !/-->/.test(l) && !/^WEBVTT/.test(l) && !/^(NOTE|STYLE|Kind:|Language:)/.test(l))
    .map((l) => l.replace(/<[^>]+>/g, "").trim())
    .filter((l, i, a) => l && l !== a[i - 1])
    .join("\n");
}

/** 파일 하나를 텍스트로. 반환: { text, format_hint, info } */
export async function fileToText(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".pdf") return { ...pdf(file), format_hint: "" };
  if ([".srt", ".vtt"].includes(ext)) return { text: subtitleToText(await readFile(file, "utf-8")), format_hint: "강의 녹취", info: {} };
  if ([".txt", ".md"].includes(ext)) return { text: await readFile(file, "utf-8"), format_hint: "", info: {} };
  const buf = await readFile(file);
  if (ext === ".pptx") return { ...pptx(buf), format_hint: "강의자료" };
  if (ext === ".docx") return { ...docx(buf), format_hint: "" };
  if (ext === ".hwpx") return { ...hwpx(buf), format_hint: "" };
  if (ext === ".hwp") throw new Error("옛 한글 형식(.hwp)은 읽지 못합니다. 한글에서 '다른 이름으로 저장 > 한글 문서(*.hwpx)' 또는 PDF로 저장해 주세요.");
  if ([".ppt", ".doc"].includes(ext)) throw new Error(`옛 오피스 형식(${ext})은 읽지 못합니다. PowerPoint·Word에서 ${ext}x 형식으로 다시 저장해 주세요.`);
  throw new Error(`지원하지 않는 파일 형식입니다: ${ext} (지원: ${[...DOC_EXTS, ...TEXT_EXTS].join(", ")})`);
}
