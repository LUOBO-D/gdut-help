import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { SecurityAlertService } from './security-alert.service.js';
import { SecurityAuditService } from './security-audit.service.js';

export type ThreatIncidentKind =
  | 'honeypot_hit'
  | 'scanner_probe'
  | 'ssrf_attempt'
  | 'admin_probe'
  | 'jwt_tamper'
  | 'share_code_miss'
  | 'auth_failure'
  | 'rate_limit_exceeded'
  | 'quota_abuse';

const INCIDENT_WEIGHTS: Record<ThreatIncidentKind, number> = {
  honeypot_hit: 100,
  ssrf_attempt: 65,
  admin_probe: 55,
  scanner_probe: 50,
  jwt_tamper: 40,
  quota_abuse: 30,
  share_code_miss: 20,
  auth_failure: 15,
  rate_limit_exceeded: 15,
};

const TARPIT_THRESHOLD = 40;
const QUARANTINE_THRESHOLD = 80;
const SCORE_DECAY_MS = 10 * 60_000;
const SUBNET_WINDOW_MS = 2 * 60_000;
const SUBNET_ATTACK_THRESHOLD = 260;
const SUBNET_QUARANTINE_MS = 15 * 60_000;
const MAX_TRACKED_IPS = 10_000;
const MAX_TRACKED_SUBNETS = 4_000;
const MAX_RECENT_EVENTS = 200;
const MAX_CONCURRENT_TARPITS = 50;

const BAN_DURATIONS_MS = [15 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000] as const;

interface IpThreatRecord {
  score: number;
  lastEventAt: number;
  quarantineUntil: number;
  banCount: number;
  lastKind: ThreatIncidentKind;
}

interface SubnetRecord {
  score: number;
  windowStart: number;
  quarantineUntil: number;
}

export interface SecurityEventLog {
  at: string;
  ip: string;
  kind: ThreatIncidentKind;
  path: string;
  score: number;
  action: 'observed' | 'tarpit' | 'quarantined' | 'subnet_quarantined';
  userId?: string;
}

export interface SecuritySummary {
  activeQuarantinedIps: number;
  activeQuarantinedSubnets: number;
  trackedIps: number;
  honeypotHitsTotal: number;
  quarantinesTotal: number;
  minNativeVersion: number;
  alertingConfigured: boolean;
  quarantinedList: { ip: string; remainingSeconds: number; banCount: number; lastKind: ThreatIncidentKind }[];
  recentEvents: SecurityEventLog[];
}

export interface ThreatDecision {
  blocked: boolean;
  tarpitMs: number;
  reason?: string;
  retryAfterSeconds?: number;
}

function normalizeIp(raw: string): string {
  const s = raw.trim();
  if (s.startsWith('::ffff:')) return s.slice(7);
  return s || 'unknown';
}

function isLoopbackOrUnknown(ip: string): boolean {
  return !ip || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1';
}

/** 提取 IPv4 /24 或 IPv6 /48 前缀，用于识别同网段代理池/僵尸网络分布式打击 */
function subnetOf(ip: string): string | null {
  if (isLoopbackOrUnknown(ip)) return null;
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  } else if (ip.includes(':')) {
    const parts = ip.split(':').filter(Boolean);
    if (parts.length >= 3) return `${parts.slice(0, 3).join(':')}::/48`;
  }
  return null;
}

/**
 * 主动安全防御与智能风控引擎（零外部依赖、内存严格有界）：
 * 1. 蜜罐诱捕（Honeypot）：命中伪装敏感接口直接 +100 分立即隔离并输出结构化告警联动宿主机 fail2ban 内核级封禁；
 * 2. 渐进式焦油坑（Tarpit）：中高风险 IP 自动注入延迟（受并发上限保护防耗尽连接），令自动化扫描效率骤降；
 * 3. 动态隔离（Quarantine）：按单 IP 与 /24 网段双重风控，反复试探按 15m → 1h → 6h → 24h 指数级延长封禁；
 * 4. 实时审计态势（Forensics）：保留最近 200 条安全告警，供管理员实时观测并支持手工解封。
 */
@Injectable()
export class ActiveDefenseService implements OnModuleInit {
  private readonly logger = new Logger('ActiveDefense');
  private readonly ipRecords = new Map<string, IpThreatRecord>();
  private readonly subnetRecords = new Map<string, SubnetRecord>();
  private readonly recentEvents: SecurityEventLog[] = [];
  private activeTarpits = 0;
  private honeypotHitsTotal = 0;
  private quarantinesTotal = 0;
  private minNativeVersion = 0;

  constructor(
    @Optional() @Inject(ENV) env?: Env,
    @Optional() private readonly audit?: SecurityAuditService,
    @Optional() private readonly alerts?: SecurityAlertService,
  ) {
    this.minNativeVersion = env?.MIN_NATIVE_VERSION ?? 0;
  }

  async onModuleInit(): Promise<void> {
    if (!this.audit) return;
    const rows = await this.audit.loadActiveBans();
    const now = Date.now();
    let restored = 0;
    for (const row of rows) {
      const expiresMs = row.expiresAt.getTime();
      if (expiresMs <= now) continue;
      if (row.kind === 'ip') {
        const ip = normalizeIp(row.target.replace(/^ip:/, ''));
        if (isLoopbackOrUnknown(ip)) continue;
        this.setBounded(this.ipRecords, MAX_TRACKED_IPS, ip, {
          score: row.score,
          lastEventAt: now,
          quarantineUntil: expiresMs,
          banCount: row.banCount,
          lastKind: (row.reason in INCIDENT_WEIGHTS ? row.reason : 'honeypot_hit') as ThreatIncidentKind,
        });
        restored += 1;
      } else if (row.kind === 'subnet') {
        const subnet = row.target.replace(/^subnet:/, '');
        this.setBounded(this.subnetRecords, MAX_TRACKED_SUBNETS, subnet, {
          score: row.score,
          windowStart: now,
          quarantineUntil: expiresMs,
        });
        restored += 1;
      }
    }
    if (restored > 0) {
      this.logger.log(`已从数据库恢复 ${restored} 条未过期的高危封禁记录`);
    }
  }

  getMinNativeVersion(): number {
    return this.minNativeVersion;
  }

  setMinNativeVersion(version: number): number {
    const next = Math.max(0, Math.min(999, Math.floor(version)));
    this.minNativeVersion = next;
    return next;
  }

  /** 请求入口预检：零数据库开销直接决定是否拦截或减速 */
  evaluate(rawIp: string, now = Date.now()): ThreatDecision {
    const ip = normalizeIp(rawIp);
    if (isLoopbackOrUnknown(ip)) return { blocked: false, tarpitMs: 0 };

    const rec = this.ipRecords.get(ip);
    if (rec && rec.quarantineUntil > now) {
      return {
        blocked: true,
        tarpitMs: 0,
        reason: 'ip_quarantined',
        retryAfterSeconds: Math.max(1, Math.ceil((rec.quarantineUntil - now) / 1000)),
      };
    }

    const subnet = subnetOf(ip);
    if (subnet) {
      const sRec = this.subnetRecords.get(subnet);
      if (sRec && sRec.quarantineUntil > now) {
        return {
          blocked: true,
          tarpitMs: 0,
          reason: 'subnet_quarantined',
          retryAfterSeconds: Math.max(1, Math.ceil((sRec.quarantineUntil - now) / 1000)),
        };
      }
    }

    if (rec) {
      const decayed = this.decayedScore(rec, now);
      if (decayed >= TARPIT_THRESHOLD && this.activeTarpits < MAX_CONCURRENT_TARPITS) {
        return { blocked: false, tarpitMs: Math.min(1500, 500 + (decayed - TARPIT_THRESHOLD) * 25) };
      }
    }

    return { blocked: false, tarpitMs: 0 };
  }

  /** 对命中焦油坑的可疑来源执行受控延迟（严控最大并发，防止攻击者借延迟反向耗尽句柄） */
  async applyTarpit(ms: number): Promise<void> {
    if (ms <= 0 || this.activeTarpits >= MAX_CONCURRENT_TARPITS) return;
    this.activeTarpits += 1;
    try {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        timer.unref();
      });
    } finally {
      this.activeTarpits = Math.max(0, this.activeTarpits - 1);
    }
  }

  /** 记录一次安全异常事件并动态计算风控动作 */
  recordIncident(
    rawIp: string,
    kind: ThreatIncidentKind,
    path: string,
    userId?: string,
    now = Date.now(),
  ): SecurityEventLog {
    const ip = normalizeIp(rawIp);
    const weight = INCIDENT_WEIGHTS[kind];
    if (kind === 'honeypot_hit') this.honeypotHitsTotal += 1;

    if (isLoopbackOrUnknown(ip)) {
      const ev: SecurityEventLog = {
        at: new Date(now).toISOString(),
        ip,
        kind,
        path: path.slice(0, 120),
        score: weight,
        action: 'observed',
        ...(userId ? { userId } : {}),
      };
      this.pushEvent(ev);
      return ev;
    }

    const prev = this.ipRecords.get(ip);
    const baseScore = prev ? this.decayedScore(prev, now) : 0;
    const score = Math.min(500, baseScore + weight);
    let banCount = prev?.banCount ?? 0;
    let quarantineUntil = prev?.quarantineUntil ?? 0;
    let action: SecurityEventLog['action'] = score >= TARPIT_THRESHOLD ? 'tarpit' : 'observed';

    if (score >= QUARANTINE_THRESHOLD || kind === 'honeypot_hit') {
      const idx = Math.min(BAN_DURATIONS_MS.length - 1, banCount);
      const durationMs = kind === 'honeypot_hit' ? Math.max(60 * 60_000, BAN_DURATIONS_MS[idx]!) : BAN_DURATIONS_MS[idx]!;
      banCount += 1;
      quarantineUntil = Math.max(quarantineUntil, now + durationMs);
      this.quarantinesTotal += 1;
      action = 'quarantined';
      this.logger.warn(
        `[SECURITY_BAN] ip=${ip} kind=${kind} score=${score} banCount=${banCount} durationSec=${Math.round(durationMs / 1000)} path=${path.slice(0, 100)}`,
      );
      if (durationMs >= 60 * 60_000 || kind === 'honeypot_hit') {
        this.audit?.persistBan({
          target: `ip:${ip}`,
          kind: 'ip',
          reason: kind,
          score,
          banCount,
          expiresAt: new Date(quarantineUntil),
        });
      }
      this.audit?.log({
        event: kind === 'honeypot_hit' ? 'honeypot_hit' : 'ip_quarantined',
        severity: kind === 'honeypot_hit' || banCount >= 2 ? 'critical' : 'warn',
        userId,
        ip,
        path,
        detail: { kind, score, banCount, durationSec: Math.round(durationMs / 1000) },
      });
      if (kind === 'honeypot_hit' || banCount >= 2) {
        this.alerts?.notify(
          {
            dedupeKey: `${kind}:${ip}`,
            title: kind === 'honeypot_hit' ? `命中蜜罐诱饵（已封禁 IP ${ip}）` : `高危来源反复触犯风控（第 ${banCount} 次隔离）`,
            severity: 'critical',
            event: kind,
            ip,
            path,
            summary: `风险分 ${score}，隔离时长 ${Math.round(durationMs / 60_000)} 分钟，已写入持久化封禁表。`,
          },
          now,
        );
      }
    }

    this.setBounded(this.ipRecords, MAX_TRACKED_IPS, ip, {
      score,
      lastEventAt: now,
      quarantineUntil,
      banCount,
      lastKind: kind,
    });

    // 同网段分布式打击检测（如代理池 /24 内多个 IP 协同撞库或扫描）
    const subnet = subnetOf(ip);
    if (subnet) {
      const sp = this.subnetRecords.get(subnet);
      const freshWindow = !sp || now - sp.windowStart > SUBNET_WINDOW_MS;
      const nextSubScore = (freshWindow ? 0 : sp.score) + weight;
      let subUntil = sp?.quarantineUntil ?? 0;
      if (nextSubScore >= SUBNET_ATTACK_THRESHOLD && subUntil <= now) {
        subUntil = now + SUBNET_QUARANTINE_MS;
        action = 'subnet_quarantined';
        this.logger.warn(
          `[SUBNET_BAN] subnet=${subnet} triggerIp=${ip} kind=${kind} subnetScore=${nextSubScore} durationSec=${SUBNET_QUARANTINE_MS / 1000}`,
        );
        this.audit?.persistBan({
          target: `subnet:${subnet}`,
          kind: 'subnet',
          reason: kind,
          score: nextSubScore,
          banCount: 1,
          expiresAt: new Date(subUntil),
        });
        this.audit?.log({
          event: 'subnet_quarantined',
          severity: 'critical',
          userId,
          ip,
          path,
          detail: { subnet, kind, subnetScore: nextSubScore, durationSec: SUBNET_QUARANTINE_MS / 1000 },
        });
        this.alerts?.notify(
          {
            dedupeKey: `subnet:${subnet}`,
            title: `检测到分布式网段打击（已联封 ${subnet}）`,
            severity: 'critical',
            event: 'subnet_quarantined',
            ip: `${ip} (${subnet})`,
            path,
            summary: `2 分钟内网段累计风险分 ${nextSubScore}（触发类型 ${kind}），已自动联封整段 15 分钟。`,
          },
          now,
        );
      }
      this.setBounded(this.subnetRecords, MAX_TRACKED_SUBNETS, subnet, {
        score: nextSubScore,
        windowStart: freshWindow ? now : sp.windowStart,
        quarantineUntil: subUntil,
      });
    }

    const ev: SecurityEventLog = {
      at: new Date(now).toISOString(),
      ip,
      kind,
      path: path.slice(0, 120),
      score,
      action,
      ...(userId ? { userId } : {}),
    };
    this.pushEvent(ev);
    return ev;
  }

  /** 管理员手工解封误伤 IP（同步清理持久化封禁表并记录审计日志） */
  unbanIp(rawIp: string, adminUserId?: string): boolean {
    const ip = normalizeIp(rawIp);
    const removed = this.ipRecords.delete(ip);
    const subnet = subnetOf(ip);
    const targets = [`ip:${ip}`];
    if (subnet) {
      this.subnetRecords.delete(subnet);
      targets.push(`subnet:${subnet}`);
    }
    this.audit?.removePersistedBans(targets);
    this.audit?.log({
      event: 'admin_unban',
      severity: 'info',
      userId: adminUserId,
      ip,
      detail: { targets, removedInMemory: removed },
    });
    return removed;
  }

  /** 管理员安全态势总览 */
  getSummary(now = Date.now()): SecuritySummary {
    const quarantinedList: SecuritySummary['quarantinedList'] = [];
    for (const [ip, rec] of this.ipRecords) {
      if (rec.quarantineUntil > now) {
        quarantinedList.push({
          ip,
          remainingSeconds: Math.ceil((rec.quarantineUntil - now) / 1000),
          banCount: rec.banCount,
          lastKind: rec.lastKind,
        });
      }
    }
    quarantinedList.sort((a, b) => b.remainingSeconds - a.remainingSeconds);

    let activeSubnets = 0;
    for (const rec of this.subnetRecords.values()) {
      if (rec.quarantineUntil > now) activeSubnets += 1;
    }

    return {
      activeQuarantinedIps: quarantinedList.length,
      activeQuarantinedSubnets: activeSubnets,
      trackedIps: this.ipRecords.size,
      honeypotHitsTotal: this.honeypotHitsTotal,
      quarantinesTotal: this.quarantinesTotal,
      minNativeVersion: this.minNativeVersion,
      alertingConfigured: this.alerts?.isConfigured() ?? false,
      quarantinedList: quarantinedList.slice(0, 50),
      recentEvents: this.recentEvents.slice(0, 50),
    };
  }

  private decayedScore(rec: IpThreatRecord, now: number): number {
    const elapsed = Math.max(0, now - rec.lastEventAt);
    const periods = Math.floor(elapsed / SCORE_DECAY_MS);
    if (periods <= 0) return rec.score;
    return Math.floor(rec.score * 0.5 ** Math.min(periods, 10));
  }

  private pushEvent(ev: SecurityEventLog) {
    this.recentEvents.unshift(ev);
    if (this.recentEvents.length > MAX_RECENT_EVENTS) {
      this.recentEvents.length = MAX_RECENT_EVENTS;
    }
  }

  private setBounded<V>(map: Map<string, V>, limit: number, key: string, value: V) {
    map.delete(key);
    map.set(key, value);
    while (map.size > limit) {
      const oldest = map.keys().next().value;
      if (oldest === undefined) break;
      map.delete(oldest);
    }
  }
}
