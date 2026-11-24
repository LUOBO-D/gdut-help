import { describe, expect, it } from 'vitest';
import { ActiveDefenseService } from './active-defense.service.js';

describe('ActiveDefenseService', () => {
  it('immediately quarantines an IP on honeypot hit and records telemetry', () => {
    const defense = new ActiveDefenseService();
    const now = 1_700_000_000_000;

    const ev = defense.recordIncident('203.0.113.10', 'honeypot_hit', '/api/v1/admin/debug', undefined, now);
    expect(ev.action).toBe('quarantined');

    const decision = defense.evaluate('203.0.113.10', now + 1000);
    expect(decision.blocked).toBe(true);
    expect(decision.reason).toBe('ip_quarantined');
    expect(decision.retryAfterSeconds).toBeGreaterThanOrEqual(3500);

    const summary = defense.getSummary(now + 1000);
    expect(summary.honeypotHitsTotal).toBe(1);
    expect(summary.activeQuarantinedIps).toBe(1);

    expect(defense.unbanIp('203.0.113.10')).toBe(true);
    expect(defense.evaluate('203.0.113.10', now + 2000).blocked).toBe(false);
  });

  it('escalates from tarpit to quarantine on repeated probes and detects /24 distributed subnet attacks', () => {
    const defense = new ActiveDefenseService();
    const now = 1_700_000_000_000;

    // Single IP escalates: 40 (jwt_tamper) -> tarpit, 80 -> quarantined
    defense.recordIncident('198.51.100.1', 'jwt_tamper', '/api/v1/grades', undefined, now);
    const mid = defense.evaluate('198.51.100.1', now + 500);
    expect(mid.blocked).toBe(false);
    expect(mid.tarpitMs).toBeGreaterThanOrEqual(500);

    defense.recordIncident('198.51.100.1', 'jwt_tamper', '/api/v1/grades', undefined, now + 1000);
    expect(defense.evaluate('198.51.100.1', now + 1500).blocked).toBe(true);

    // Distributed attack across 5 different IPs in same /24 subnet (5 * 55 = 275 >= 260)
    for (let i = 10; i < 15; i++) {
      defense.recordIncident(`192.0.2.${i}`, 'admin_probe', '/api/v1/admin/merchants', `u${i}`, now + i * 100);
    }
    // Even an unseen 6th IP in the attacking /24 subnet is quarantined!
    const subnetDecision = defense.evaluate('192.0.2.99', now + 5000);
    expect(subnetDecision.blocked).toBe(true);
    expect(subnetDecision.reason).toBe('subnet_quarantined');
  });

  it('never quarantines loopback addresses', () => {
    const defense = new ActiveDefenseService();
    defense.recordIncident('127.0.0.1', 'honeypot_hit', '/.env');
    expect(defense.evaluate('127.0.0.1').blocked).toBe(false);
  });
});
