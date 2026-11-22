#!/usr/bin/env node
/**
 * 一键打包并推送安卓 OTA 热更新到云端服务器（无需重启云端容器，10 秒全校生效）。
 *
 * 用法：
 *   pnpm ota:cloud 0.3.2 "优化3D校园地图细节"
 *   pnpm ota:cloud 0.3.2 "更新说明" --min-native=4
 *
 * 从根目录 .env.deploy.local（已 gitignore）或环境变量读取：
 *   DEPLOY_HOST=root@<你的云端IP>
 *   DEPLOY_KEY=<本地SSH私钥路径>
 *   DEPLOY_OTA_DIR=/srv/gdut_help/docker/ota-bundles
 *   DEPLOY_PUBLIC_URL=https://youhelp.top
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const envDeployPath = join(rootDir, '.env.deploy.local');

if (existsSync(envDeployPath)) {
  const raw = readFileSync(envDeployPath, 'utf-8').replace(/^\uFEFF/, '');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}

const deployHost = process.env.DEPLOY_HOST?.trim();
const deployKey = process.env.DEPLOY_KEY?.trim();
const deployOtaDir = (process.env.DEPLOY_OTA_DIR || '/srv/gdut_help/docker/ota-bundles').trim();
const deployPublicUrl = process.env.DEPLOY_PUBLIC_URL?.trim();

if (!deployHost) {
  console.error('缺少 DEPLOY_HOST，请在项目根目录创建 .env.deploy.local 并填写 DEPLOY_HOST=root@<服务器IP>');
  process.exit(1);
}

const passArgs = process.argv.slice(2);
execFileSync(process.execPath, [join(__dirname, 'publish-ota.mjs'), ...passArgs], {
  cwd: rootDir,
  stdio: 'inherit',
});

const otaDir = join(rootDir, 'apps', 'server', 'ota-bundles');
const manifestPath = join(otaDir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
const zipPath = join(otaDir, manifest.file);

const scpBase = ['-4', '-o', 'BatchMode=yes'];
if (deployKey) scpBase.push('-i', deployKey);

console.log(`\n[OTA-CLOUD] 正在上传 ${manifest.file} 到 ${deployHost}:${deployOtaDir}/ …`);
// 先传 zip 再传 manifest.json，保证原子切换（不会出现客户端读到新 manifest 却下不到 zip）
execFileSync('scp', [...scpBase, zipPath, `${deployHost}:${deployOtaDir}/${manifest.file}`], { stdio: 'inherit' });
execFileSync('scp', [...scpBase, manifestPath, `${deployHost}:${deployOtaDir}/manifest.json`], { stdio: 'inherit' });

console.log(`[OTA-CLOUD] 上传完成！v${manifest.version} 已在云端热更新服务生效（无需重启容器）。`);
if (deployPublicUrl) {
  console.log(`[OTA-CLOUD] 检查地址：${deployPublicUrl.replace(/\/+$/, '')}/api/v1/app/update`);
}
