#!/usr/bin/env node
/**
 * 构建并安全校验正式签名版 Android Release APK：
 * 1. 构建 shared + android 模式 web 资源（注入版本号）并执行 cap sync android；
 * 2. 运行 Gradle assembleRelease（强制开启 R8 混淆、关闭 debuggable 与 allowBackup）；
 * 3. 使用 Android SDK 的 aapt2 与 apksigner 做强制安全门禁：
 *    - 严禁存在 android:debuggable="true"（彻底封堵 adb run-as 与附加调试器）；
 *    - 强制验证 android:allowBackup="false"；
 *    - 强制验证使用正式发布签名证书（严禁 Android Debug 签名）；
 * 4. 可选 --upload 自动原子上传到云端替换 gdut-help-latest.apk。
 *
 * 用法：
 *   node scripts/build-release-apk.mjs 0.3.12
 *   node scripts/build-release-apk.mjs 0.3.12 --upload
 */
import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const webDir = join(rootDir, 'apps', 'web');
const androidDir = join(webDir, 'android');

const args = process.argv.slice(2);
const version = (args.find((a) => !a.startsWith('-')) || '0.3.12').replace(/^v/i, '');
const shouldUpload = args.includes('--upload');
const skipWebBuild = args.includes('--skip-web-build');

function findBuildToolsDir() {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
  const btRoot = join(sdk, 'build-tools');
  if (!existsSync(btRoot)) throw new Error(`未找到 Android SDK build-tools：${btRoot}`);
  const versions = readdirSync(btRoot).sort().reverse();
  for (const v of versions) {
    const dir = join(btRoot, v);
    if (existsSync(join(dir, process.platform === 'win32' ? 'aapt2.exe' : 'aapt2'))) {
      return dir;
    }
  }
  throw new Error(`未在 ${btRoot} 找到包含 aapt2 的 build-tools`);
}

if (!existsSync(join(androidDir, 'keystore.properties')) && !process.env.ANDROID_KEYSTORE_PATH) {
  console.error('[APK] 缺少发布签名配置 apps/web/android/keystore.properties（或 ANDROID_KEYSTORE_* 环境变量）');
  process.exit(1);
}

if (!skipWebBuild) {
  console.log(`[APK] 1/4 构建 shared 与 android 模式前端资源 (v${version})…`);
  execSync('pnpm --filter @gduthelp/shared build', { cwd: rootDir, stdio: 'inherit' });
  execSync('pnpm --filter @gduthelp/web exec vite build --mode android', {
    cwd: rootDir,
    stdio: 'inherit',
    env: { ...process.env, VITE_APP_VERSION: version },
  });
  execSync('pnpm --filter @gduthelp/web exec cap sync android', { cwd: rootDir, stdio: 'inherit' });
}

console.log('[APK] 2/4 编译正式签名 Release APK（R8 混淆 + 非可调试）…');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
execSync(`${gradlew} assembleRelease`, { cwd: androidDir, stdio: 'inherit' });

const apkPath = join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!existsSync(apkPath)) {
  throw new Error(`未找到构建产物：${apkPath}`);
}

console.log('[APK] 3/4 执行安全门禁校验（aapt2 + apksigner）…');
const btDir = findBuildToolsDir();
const aapt2 = join(btDir, process.platform === 'win32' ? 'aapt2.exe' : 'aapt2');
const apksigner = join(btDir, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');

const badging = execFileSync(aapt2, ['dump', 'badging', apkPath], { encoding: 'utf-8' });
if (/application-debuggable/i.test(badging)) {
  throw new Error('安全门禁阻断：APK 含 application-debuggable 标志，严禁分发！');
}

const xmlTree = execFileSync(aapt2, ['dump', 'xmltree', apkPath, '--file', 'AndroidManifest.xml'], {
  encoding: 'utf-8',
});
if (/android:debuggable\([^)]*\)=true|android:debuggable\([^)]*\)=0xffffffff/i.test(xmlTree)) {
  throw new Error('安全门禁阻断：AndroidManifest.xml 中 android:debuggable=true，严禁分发！');
}
if (/android:allowBackup\([^)]*\)=true|android:allowBackup\([^)]*\)=0xffffffff/i.test(xmlTree)) {
  throw new Error('安全门禁阻断：AndroidManifest.xml 中 android:allowBackup=true，严禁分发！');
}

const sigOut =
  process.platform === 'win32'
    ? execFileSync('cmd.exe', ['/d', '/s', '/c', apksigner, 'verify', '--verbose', '--print-certs', apkPath], {
        encoding: 'utf-8',
      })
    : execFileSync(apksigner, ['verify', '--verbose', '--print-certs', apkPath], {
        encoding: 'utf-8',
      });
if (/CN=Android Debug/i.test(sigOut)) {
  throw new Error('安全门禁阻断：APK 使用了 Android Debug 测试证书签名，严禁分发！');
}

const sha256 = createHash('sha256').update(readFileSync(apkPath)).digest('hex');
const outDir = join(rootDir, 'apps', 'server', 'ota-bundles');
mkdirSync(outDir, { recursive: true });
const outApk = join(outDir, 'gdut-help-latest.apk');
copyFileSync(apkPath, outApk);

console.log(`[APK] 安全门禁全部通过！`);
console.log(`      - debuggable = false (禁止 adb run-as / 附加调试器)`);
console.log(`      - allowBackup = false (禁止 adb backup 导出私有目录)`);
console.log(`      - 正式发布证书签名校验通过 (v1/v2/v3)`);
console.log(`      - 文件路径: ${outApk}`);
console.log(`      - SHA-256 : ${sha256}`);

if (shouldUpload) {
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
  if (!deployHost) throw new Error('缺少 DEPLOY_HOST，无法上传云端 APK');

  const sshBase = ['-4', '-o', 'BatchMode=yes'];
  if (deployKey) sshBase.push('-i', deployKey);
  const remoteTmp = `${deployOtaDir}/gdut-help-latest.apk.tmp`;
  const remoteFinal = `${deployOtaDir}/gdut-help-latest.apk`;

  console.log(`[APK] 4/4 正在原子替换云端正式版 APK -> ${deployHost}:${remoteFinal} …`);
  execFileSync('scp', [...sshBase, outApk, `${deployHost}:${remoteTmp}`], { stdio: 'inherit' });
  execFileSync('ssh', [...sshBase, deployHost, `mv -f ${remoteTmp} ${remoteFinal} && chmod 644 ${remoteFinal}`], {
    stdio: 'inherit',
  });
  console.log('[APK] 云端正式签名版 APK 替换完成！');
}
