/** Single source of motion tokens (seconds). CSS counterparts live in styles/index.css. */
export const motionTokens = {
  fast: 0.14,       // button / hover feedback
  base: 0.26,       // panels, menus, dialogs
  page: 0.36,       // route transitions
  scene: 0.9,       // hero scene emergence
  camera: 0.08,     // 3D camera lerp factor per frame
  ease: [0.2, 0.8, 0.2, 1] as [number, number, number, number],
}
export type MotionSetting = 'system' | 'full' | 'reduced'
export function resolveReducedMotion(setting: MotionSetting, systemPrefersReduced: boolean): boolean {
  return setting === 'reduced' || (setting === 'system' && systemPrefersReduced)
}
