import { Injectable, Logger } from '@nestjs/common';

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
export class ActiveDefenseService {
  private readonly logger = new Logger('ActiveDefense');
  private readonly ipRecords = new Map<string, IpThreatRecord>();
  private readonly subnetRecords = new Map<string, SubnetRecord>();
  private readonly recentEvents: SecurityEventLog[] = [];
  private activeTarpits = 0;
  private honeypotHitsTotal = 0;
  private quarantinesTotal = 0;

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

  /** 管理员手工解封误伤 IP */
  unbanIp(rawIp: string): boolean {
    const ip = normalizeIp(rawIp);
    const removed = this.ipRecords.delete(ip);
    const subnet = subnetOf(ip);
    if (subnet) this.subnetRecords.delete(subnet);
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
