import type { Alert, Thresholds } from './api'
import { METRICS, isMetric } from './metrics'

export type Advice = { title: string; steps: string[] }

const SENSOR: Advice = {
  title: 'Nghi lỗi cảm biến, chưa kết luận ô nhiễm',
  steps: [
    'Kiểm tra đầu dò: bám bẩn, bọt khí, ngập đủ sâu chưa',
    'Kiểm tra dây tín hiệu và nguồn cấp của bo mạch',
    'Hiệu chuẩn lại bằng dung dịch chuẩn rồi ghi nhận hiệu chuẩn',
    'Lấy mẫu tay đo đối chứng trước khi đánh giá chất lượng nước',
  ],
}

// Gợi ý theo kinh nghiệm vận hành hệ thống xử lý nước thải; kỹ sư tại cơ sở quyết định
const RULES: Record<string, Advice> = {
  'ph-low': {
    title: 'Nước thải có tính axit',
    steps: ['Kiểm tra bơm định lượng xút (NaOH) ở bể điều chỉnh pH', 'Rà soát công đoạn sản xuất vừa xả axit hoặc dung dịch tẩy rửa', 'Tạm giữ nước ở bể chứa, chưa xả ra nguồn tiếp nhận', 'Lấy mẫu đối chứng'],
  },
  'ph-high': {
    title: 'Nước thải có tính kiềm',
    steps: ['Kiểm tra bơm định lượng axit trung hòa', 'Rà soát công đoạn nhuộm, nấu tẩy hoặc xả vôi', 'Tạm giữ nước ở bể chứa, chưa xả ra nguồn tiếp nhận', 'Lấy mẫu đối chứng'],
  },
  'temp-high': {
    title: 'Nhiệt độ nước thải cao',
    steps: ['Kiểm tra nước giải nhiệt hoặc nước ngưng nóng xả lẫn vào', 'Kiểm tra tháp giải nhiệt, bể điều hòa', 'Nhiệt độ cao làm giảm hiệu quả xử lý sinh học: theo dõi bể hiếu khí'],
  },
  'tds-high': {
    title: 'Chất rắn hòa tan cao',
    steps: ['Kiểm tra xả muối, hóa chất hoặc dịch thải đậm đặc', 'Kiểm tra van bypass, đường nước thải chưa xử lý xả thẳng', 'Kiểm tra màng lọc nếu hệ thống có RO/UF'],
  },
  'turbidity-high': {
    title: 'Nước đục, có cặn lơ lửng',
    steps: ['Kiểm tra liều hóa chất keo tụ (PAC) và trợ lắng (polymer)', 'Kiểm tra bể lắng: bùn nổi, bùn trôi theo dòng ra', 'Kiểm tra máy khuấy và thời gian lưu nước'],
  },
  'flow-high': {
    title: 'Lưu lượng tăng bất thường',
    steps: ['Kiểm tra lịch sản xuất: có mẻ xả lớn không báo trước?', 'Kiểm tra nước mưa hoặc nước ngoài chảy vào hệ thống', 'Kiểm tra van bypass bể xử lý'],
  },
  'flow-low': {
    title: 'Lưu lượng giảm bất thường',
    steps: ['Kiểm tra bơm chuyển bậc và tắc nghẽn đường ống', 'Đối chiếu với lịch dừng sản xuất'],
  },
}

/** Chọn gợi ý theo loại cảnh báo, chỉ số và chiều lệch (thấp/cao) */
export function adviceFor(a: Pick<Alert, 'kind' | 'metric' | 'value'>, th: Thresholds): Advice {
  if (a.kind === 'sensor') return SENSOR
  if (!isMetric(a.metric)) return { title: 'Bất thường', steps: ['Kiểm tra thiết bị và quy trình vận hành'] }
  const [lo, hi] = th[a.metric] ?? [null, null]
  const mid = lo != null && hi != null ? (lo + hi) / 2 : lo ?? (hi != null ? hi / 2 : null)
  const dir = lo != null && a.value < lo ? 'low' : hi != null && a.value > hi ? 'high' : mid != null && a.value < mid ? 'low' : 'high'
  const rule = RULES[`${a.metric}-${dir}`]
  const base = rule ?? { title: `${METRICS[a.metric].label} ${dir === 'low' ? 'thấp' : 'cao'} bất thường`, steps: ['Kiểm tra vận hành trong 30 phút gần nhất'] }
  if (a.kind === 'spike') return { title: `Biến động đột ngột · ${base.title.toLowerCase()}`, steps: ['Đối chiếu với lịch sản xuất và thao tác vận hành gần nhất', ...base.steps] }
  return base
}
