/** Đọc token màu "r g b" từ CSS để vẽ canvas/biểu đồ theo đúng theme đang bật */
export function rgb(name: string, alpha = 1): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim().split(/\s+/).join(',')
  return `rgba(${v},${alpha})`
}

export function channels(name: string): [number, number, number] {
  const p = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim().split(/\s+/).map(Number)
  return [p[0] || 0, p[1] || 0, p[2] || 0]
}

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
