import { motion } from 'motion/react';
import { useState } from 'react';
import { GlassCard } from '../../components/GlassCard';
import { Switch } from '../../components/Switch';
import { spring } from '../../motion/presets';
import { QUALITY_LABEL, type QualityPreference } from '../../three/quality';
import { useEffectiveQuality, useQualityStore } from '../../three/quality-store';
import { enableGyro, GYRO_ERRORS } from '../../three/use-parallax-input';

const OPTIONS: { value: QualityPreference; label: string }[] = [
  { value: 'auto', label: '自动' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
];

export function DisplaySettings() {
  const s = useQualityStore();
  const quality = useEffectiveQuality();
  const [gyroError, setGyroError] = useState<string | null>(null);
  const [gyroChecking, setGyroChecking] = useState(false);

  const toggleGyro = async (on: boolean) => {
    setGyroError(null);
    if (!on) return s.setGyro(false);
    // iOS 只允许在点击事件里申请权限，所以在这里而不是页面加载时申请
    setGyroChecking(true);
    const result = await enableGyro();
    setGyroChecking(false);
    if (result === 'ok') s.setGyro(true);
    else setGyroError(GYRO_ERRORS[result]);
  };

  return (
    <GlassCard className="p-5">
      <h2 className="text-[15px] font-semibold">显示设置</h2>

      <div className="mt-4">
        <p className="text-sm text-fg-muted">画质</p>
        <div className="glass-thin mt-2 grid grid-cols-4 gap-1 rounded-2xl! p-1" role="radiogroup" aria-label="画质">
          {OPTIONS.map(({ value, label }) => {
            const active = s.preference === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => s.setPreference(value)}
                className={`relative rounded-xl py-2 text-sm ${active ? 'font-semibold' : 'text-fg-muted'}`}
              >
                {active && (
                  <motion.span layoutId="quality-active" className="absolute inset-0 rounded-xl bg-white/35" transition={spring.snappy} />
                )}
                <span className="relative">{label}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-fg-muted">
          当前：{quality ? QUALITY_LABEL[quality] : '检测中'}
          {s.preference === 'auto' && s.gpu && ` · ${s.gpu}`}
          {s.preference === 'auto' && s.cap && (
            <>
              {' · '}因帧率不足已降为{QUALITY_LABEL[s.cap]}
              {' · '}
              <button type="button" className="underline" onClick={s.redetect}>
                重新检测
              </button>
            </>
          )}
          <br />高：完整 3D 天空；中：减少粒子和模糊；低：不显示 3D，玻璃不模糊，最省电。
        </p>
      </div>

      <div className="mt-3 divide-y divide-current/10">
        <Switch
          label="陀螺仪视差"
          description={gyroChecking ? '正在检测陀螺仪…' : '倾斜手机时天空随之移动（需要 HTTPS 访问）'}
          checked={s.gyro}
          onChange={(v) => void toggleGyro(v)}
        />
        {gyroError && <p className="pb-2 text-xs text-danger">{gyroError}</p>}
        <Switch label="显示帧率" description="屏幕右下角显示实时帧率，用来检查是否流畅" checked={s.showFps} onChange={s.setShowFps} />
      </div>
    </GlassCard>
  );
}
