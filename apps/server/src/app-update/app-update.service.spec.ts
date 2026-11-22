import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../config/env.js';
import { AppUpdateService } from './app-update.service.js';

describe('AppUpdateService', () => {
  let dir: string;
  let service: AppUpdateService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gduthelp-ota-'));
    service = new AppUpdateService({ OTA_DIR: dir } as Env);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when no manifest exists', () => {
    expect(service.getLatest()).toBeNull();
  });

  it('returns manifest with derived sizeBytes only when the referenced bundle zip exists', () => {
    const manifest = {
      version: '0.2.1',
      minNativeVersion: 2,
      notes: '1. 优化课表切换流畅度\n2. 新增更新弹窗',
      file: 'bundle-0.2.1.zip',
      publishedAt: '2026-11-21T12:00:00.000Z',
    };
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
    expect(service.getLatest()).toBeNull();

    const zipBytes = Buffer.from('PK\x05\x06test');
    writeFileSync(join(dir, 'bundle-0.2.1.zip'), zipBytes);
    expect(service.getLatest()).toEqual({ ...manifest, sizeBytes: zipBytes.length });
    expect(service.resolveBundleFile('bundle-0.2.1.zip').filename).toBe('bundle-0.2.1.zip');
  });

  it('resolves hosted latest APK when present', () => {
    expect(service.hasLatestApk()).toBe(false);
    expect(() => service.resolveLatestApk()).toThrow(NotFoundException);

    writeFileSync(join(dir, 'gdut-help-latest.apk'), Buffer.from('APK'));
    expect(service.hasLatestApk()).toBe(true);
    expect(service.resolveLatestApk().filename).toBe('gdut-help.apk');

    writeFileSync(join(dir, 'bundle-0.3.2.zip'), Buffer.from('PK\x05\x06'));
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({
        version: '0.3.2',
        minNativeVersion: 4,
        notes: '新版更新说明',
        file: 'bundle-0.3.2.zip',
        publishedAt: '2026-11-22T06:00:00.000Z',
      }),
    );
    expect(service.resolveLatestApk().filename).toBe('gdut-help-v0.3.2.apk');
  });

  it('rejects path traversal and invalid filenames', () => {
    expect(() => service.resolveBundleFile('../.env')).toThrow(BadRequestException);
    expect(() => service.resolveBundleFile('bundle-../x.zip')).toThrow(BadRequestException);
    expect(() => service.resolveBundleFile('other.zip')).toThrow(BadRequestException);
    expect(() => service.resolveBundleFile('bundle-9.9.9.zip')).toThrow(NotFoundException);
  });
});
