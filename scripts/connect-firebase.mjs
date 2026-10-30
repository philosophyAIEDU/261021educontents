// 내려받은 서비스 계정 키를 keys/ 에 넣고 .env 를 만든 뒤, 이미 만든 Firebase에 연결되는지 확인한다.
//
//   node scripts/connect-firebase.mjs                다운로드 폴더에서 키를 찾아 넣고 연결을 확인한다
//   node scripts/connect-firebase.mjs --file <경로>   키 파일을 직접 지정한다
//   --project <ID>                                   파일 이름에서 프로젝트 ID를 알 수 없을 때 지정한다
//   --replace                                        이미 있는 키를 새 키로 바꾼다
//
// 키 파일은 옮기기만 하고 내용을 출력하지 않는다. 오류 원문에 키 조각이 섞일 수 있어 원문도 출력하지 않는다.
// .env 에서는 FIREBASE_PROJECT_ID 와 GOOGLE_APPLICATION_CREDENTIALS 만 쓴다.

import { access, copyFile, mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { ROOT } from "./profile.mjs";
import { INPUT_COLLECTION } from "./schema.mjs";

const DEFAULT_KEY = "keys/service-account.json";
const KEY_NAME = /firebase-adminsdk.*\.json$/i;
const TIMEOUT_MS = 30000;

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
const fail = (message) => { console.error(message); process.exit(1); };

const envPath = path.join(ROOT, ".env");
const envText = (await exists(envPath)) ? await readFile(envPath, "utf-8") : null;
const envValue = (key) => envText?.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1].trim() || "";

async function findDownloadedKey() {
  const dir = path.join(homedir(), "Downloads");
  let names = [];
  try { names = (await readdir(dir)).filter((n) => KEY_NAME.test(n)); } catch { return null; }
  const files = await Promise.all(names.map(async (n) => ({ file: path.join(dir, n), time: (await stat(path.join(dir, n))).mtimeMs })));
  return files.sort((a, b) => b.time - a.time)[0]?.file ?? null;
}

async function moveFile(from, to) {
  await mkdir(path.dirname(to), { recursive: true });
  try {
    await rename(from, to);
  } catch (err) {
    if (err.code !== "EXDEV") throw err;
    await copyFile(from, to);
    await unlink(from);
  }
}

// 1. 키 넣기
const keyRelative = envValue("GOOGLE_APPLICATION_CREDENTIALS") || DEFAULT_KEY;
const keyPath = path.resolve(ROOT, keyRelative);
const source = option("--file") ?? (await findDownloadedKey());
const hasKey = await exists(keyPath);

if (option("--file") && !(await exists(source))) fail(`[키 없음] 파일을 찾지 못했습니다: ${source}`);
if (source && (!hasKey || args.includes("--replace"))) {
  await moveFile(source, keyPath);
  console.log(`[키] ${path.basename(source)} 를 ${keyRelative} 로 옮겼습니다.`);
} else if (hasKey) {
  console.log(`[키] ${keyRelative} 가 이미 있어 그대로 씁니다.${source ? ` 다운로드 폴더의 ${path.basename(source)} 로 바꾸려면 --replace 를 붙입니다.` : ""}`);
} else {
  const others = (await exists(path.join(ROOT, "keys"))) ? (await readdir(path.join(ROOT, "keys"))).filter((n) => !n.startsWith(".")) : [];
  fail(`[키 없음] 다운로드 폴더에서 키 파일을 찾지 못했습니다.${others.length ? `\n  keys/ 에 있는 파일: ${others.join(", ")} (이름이 service-account.json 이어야 합니다)` : ""}\n  Firebase 콘솔에서 키를 받았는지 확인하세요 (FIREBASE_KEY_GUIDE.md 1단계). 다른 폴더에 받았다면 --file <경로> 로 지정합니다.`);
}

// 2. .env 만들기 (프로젝트 ID 는 공개 값이다. 파일 이름이 "<프로젝트 ID>-firebase-adminsdk-..." 이다)
const fromName = source ? path.basename(source).match(/^(.+?)-firebase-adminsdk-/)?.[1] : undefined;
const projectId = envValue("FIREBASE_PROJECT_ID") || option("--project") || fromName;
if (!projectId) fail("[프로젝트 ID 필요] 파일 이름에서 프로젝트 ID를 알 수 없습니다. --project <프로젝트 ID> 를 붙여 다시 실행하세요.");

if (envText === null) {
  const template = await readFile(path.join(ROOT, ".env.example"), "utf-8");
  await writeFile(envPath, template.replace(/^FIREBASE_PROJECT_ID=.*$/m, `FIREBASE_PROJECT_ID=${projectId}`));
  console.log(`[.env] 만들었습니다. 프로젝트 ID: ${projectId}`);
} else if (!envValue("FIREBASE_PROJECT_ID")) {
  await writeFile(envPath, envText.replace(/^FIREBASE_PROJECT_ID=.*$/m, `FIREBASE_PROJECT_ID=${projectId}`));
  console.log(`[.env] 프로젝트 ID를 적었습니다: ${projectId}`);
} else {
  console.log(`[.env] 이미 있어 그대로 씁니다. 프로젝트 ID: ${projectId}`);
}

// 3. 연결 확인 (읽기만 하고 아무것도 쓰지 않는다)
process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;

function explain(err) {
  const text = `${err?.code ?? ""} ${err?.message ?? ""}`;
  if (err?.code === 5) return "[Firestore 없음] 이 프로젝트에 Firestore Database가 아직 없습니다. Firebase 콘솔의 빌드 > Firestore Database에서 데이터베이스를 만드세요.";
  if (err?.code === 7) return `[프로젝트 불일치] 키가 프로젝트 ${projectId} 의 것이 아닐 수 있습니다. 사이트를 만든 프로젝트에서 키를 다시 받으세요.`;
  if (err?.code === 16 || /invalid_grant|invalid_client|account not found/i.test(text)) return "[키 무효] 삭제되었거나 잘못된 키입니다. Firebase 콘솔에서 새 키를 받아 --replace 를 붙여 다시 실행하세요.";
  if (/credential|JSON|ENOENT/i.test(text)) return "[키 읽기 실패] 키 파일이 올바르지 않습니다. Firebase 콘솔에서 새 키를 받아 --replace 를 붙여 다시 실행하세요.";
  return `[연결 실패] 인터넷 연결을 확인하고 다시 시도하세요. 계속되면 이 오류 코드를 알려 주세요: ${err?.code ?? "알 수 없음"}`;
}

let firebase;
try {
  const [{ initializeApp, applicationDefault }, { getFirestore }] = await Promise.all([import("firebase-admin/app"), import("firebase-admin/firestore")]);
  firebase = { initializeApp, applicationDefault, getFirestore };
} catch {
  fail("[프로그램 필요] npm install --prefix scripts 를 먼저 실행하세요.");
}

try {
  firebase.initializeApp({ credential: firebase.applicationDefault(), projectId });
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS));
  await Promise.race([firebase.getFirestore().collection(INPUT_COLLECTION).limit(1).get(), timeout]);
  console.log(`\n[연결 성공] 프로젝트 ${projectId} 에 연결되었습니다.`);
  process.exit(0);
} catch (err) {
  fail(`\n${explain(err)}`);
}
