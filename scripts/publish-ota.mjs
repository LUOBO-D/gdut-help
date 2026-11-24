#!/usr/bin/env node
/**
 * 自托管安卓 App OTA 热更新一键打包脚本。
 *
 * 用法：
 *   pnpm ota:pack 0.2.1 "修复课表切换卡顿"
 *   pnpm ota:pack 0.3.0 "新增功能" --min-native=2
 *
 * 会自动：
 *   1. 构建 shared 与 android 模式的 apps/web/dist（注入 VITE_APP_VERSION）
 *   2. 将 dist 目录下的文件以标准 POSIX 路径打包为 apps/server/ota-bundles/bundle-<version>.zip
 *   3. 计算 SHA-256 并更新 apps/server/ota-bundles/manifest.json（后端立即生效，无需重启）
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const webDistDir = join(rootDir, 'apps', 'web', 'dist');
const otaDir = join(rootDir, 'apps', 'server', 'ota-bundles');

function parseArgs(argv) {
  let version = '';
  let notes = '';
  let notesFile = '';
  let apkUrl = '';
  let minNativeVersion = 6;
  let skipBuild = false;

  for (const arg of argv) {
    if (arg === '--skip-build') {
      skipBuild = true;
    } else if (arg.startsWith('--min-native=')) {
      minNativeVersion = Number.parseInt(arg.slice('--min-native='.length), 10);
    } else if (arg.startsWith('--notes-file=')) {
      notesFile = arg.slice('--notes-file='.length).trim();
    } else if (arg.startsWith('--apk-url=')) {
      apkUrl = arg.slice('--apk-url='.length).trim();
    } else if (!version) {
      version = arg.trim().replace(/^v/i, '');
    } else if (!notes) {
      notes = arg.trim();
    }
  }

  if (notesFile) {
    notes = readFileSync(resolve(rootDir, notesFile), 'utf-8').trim();
  }
  // 兼容 Windows PowerShell 命令行里直接传 "1. xxx\n2. yyy" 的字面量 \n
  notes = notes.replace(/\\n/g, '\n').trim();

  if (!/^\d+\.\d+\.\d+([-.][a-zA-Z0-9.]+)?$/.test(version)) {
    console.error('用法: pnpm ota:pack <version> [更新说明] [--min-native=4] [--notes-file=notes.txt]');
    console.error('示例: pnpm ota:pack 0.3.2 "1. 新增更新说明弹窗\\n2. 支持自主选择更新"');
    process.exit(1);
  }
  if (!Number.isInteger(minNativeVersion) || minNativeVersion < 1) {
    console.error('--min-native 必须是正整数');
    process.exit(1);
  }
  return { version, notes: notes || `热更新 v${version}`, minNativeVersion, apkUrl: apkUrl || undefined, skipBuild };
}

// IEEE 802.3 CRC-32 表
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[i] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function walkFiles(dir, baseDir = dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkFiles(full, baseDir));
    } else if (st.isFile()) {
      const rel = relative(baseDir, full).replace(/\\/g, '/');
      out.push({ full, rel, mtime: st.mtime });
    }
  }
  return out;
}

function toDosTimeDate(date) {
  const year = Math.max(1980, date.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  return { dosTime, dosDate };
}

/** 生成标准 ZIP（强制使用 POSIX `/` 路径分隔符，确保 Android ZipInputStream 100% 兼容） */
function createZipBuffer(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const raw = readFileSync(file.full);
    const deflated = deflateRawSync(raw, { level: 9 });
    const useDeflate = deflated.length < raw.length;
    const payload = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);
    const nameBuf = Buffer.from(file.rel, 'utf-8');
    const { dosTime, dosDate } = toDosTimeDate(file.mtime);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 文件名标记
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    localParts.push(local, payload);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);

    centralParts.push(central);
    offset += local.length + payload.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

function main() {
  const { version, notes, minNativeVersion, apkUrl, skipBuild } = parseArgs(process.argv.slice(2));
  const env = { ...process.env, VITE_APP_VERSION: version };

  if (!skipBuild) {
    console.log(`[OTA] 正在构建前端资源包 v${version}…`);
    const opts = { cwd: rootDir, stdio: 'inherit', env };
    execSync('pnpm --filter @gduthelp/shared build', opts);
    execSync('pnpm --filter @gduthelp/web exec tsc -b', opts);
    execSync('pnpm --filter @gduthelp/web exec vite build --mode android', opts);
  }

  if (!existsSync(join(webDistDir, 'index.html'))) {
    console.error(`未找到 ${join(webDistDir, 'index.html')}，请先构建前端`);
    process.exit(1);
  }

  const files = walkFiles(webDistDir);
  const zipBuf = createZipBuffer(files);
  const sha256 = createHash('sha256').update(zipBuf).digest('hex');

  mkdirSync(otaDir, { recursive: true });
  const fileName = `bundle-${version}.zip`;
  const zipPath = join(otaDir, fileName);
  writeFileSync(zipPath, zipBuf);

  const manifest = {
    version,
    minNativeVersion,
    notes,
    file: fileName,
    sha256,
    sizeBytes: zipBuf.length,
    ...(apkUrl ? { apkUrl } : {}),
    publishedAt: new Date().toISOString(),
  };
  writeFileSync(join(otaDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

  const sizeMb = (zipBuf.length / (1024 * 1024)).toFixed(2);
  console.log('');
  console.log(`[OTA] 打包完成：${zipPath} (${sizeMb} MB, ${files.length} 个文件)`);
  console.log(`[OTA] SHA-256: ${sha256}`);
  console.log(`[OTA] 已更新 ${join(otaDir, 'manifest.json')}，用户打开 App 后将看到更新说明弹窗并自主选择是否更新。`);
}

main();
