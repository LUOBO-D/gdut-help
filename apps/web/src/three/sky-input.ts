/**
 * 3D 场景每帧读取的共享数值。放在普通对象里而不是 React state，
 * 因为它们每帧都变，走 React 渲染没有意义。
 */
export const skyInput = {
  /** 视差目标，-1..1。来自鼠标位置或手机倾斜 */
  parallaxX: 0,
  parallaxY: 0,
  /** 闪电亮度 0..1，云层据此提亮 */
  flash: 0,
};
