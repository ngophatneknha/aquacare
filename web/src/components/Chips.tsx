import type { AlertKind, AlertStatus } from '../lib/api'
import type { Calibration, Risk } from '../lib/kpi'
import { KIND_LABEL, STATUS_LABEL } from '../lib/labels'

const base = 'inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold'
const tone = {
  bad: 'bg-bad/15 text-bad',
  warn: 'bg-warn/15 text-warn',
  ok: 'bg-ok/15 text-ok',
  info: 'bg-accent/15 text-accent',
  muted: 'bg-muted/15 text-muted',
}
const Dot = () => <span className="h-1.5 w-1.5 rounded-full bg-current" />

const STATUS_TONE: Record<AlertStatus, keyof typeof tone> = { new: 'bad', investigating: 'warn', resolved: 'ok', false_alarm: 'muted' }
export const StatusChip = ({ status }: { status: AlertStatus }) => <span className={`${base} ${tone[STATUS_TONE[status]]}`}><Dot />{STATUS_LABEL[status]}</span>

const KIND_TONE: Record<AlertKind, keyof typeof tone> = { threshold: 'bad', spike: 'warn', sensor: 'info' }
export const KindChip = ({ kind }: { kind: AlertKind }) => <span className={`${base} ${tone[KIND_TONE[kind]]}`}>{KIND_LABEL[kind]}</span>

export const OnlineChip = ({ online }: { online: boolean }) =>
  <span className={`${base} ${online ? tone.ok : tone.muted}`}><Dot />{online ? 'Trực tuyến' : 'Mất tín hiệu'}</span>

const CAL: Record<Calibration, [string, keyof typeof tone]> = { ok: ['Còn hạn', 'ok'], due: ['Quá hạn', 'warn'], never: ['Chưa hiệu chuẩn', 'warn'] }
export const CalibrationChip = ({ state }: { state: Calibration }) => <span className={`${base} ${tone[CAL[state][1]]}`}>{CAL[state][0]}</span>

const RISK: Record<Risk['level'], [string, keyof typeof tone]> = { high: ['Ưu tiên cao', 'bad'], medium: ['Theo dõi', 'warn'], low: ['Ổn định', 'ok'] }
export const RiskChip = ({ level }: { level: Risk['level'] }) => <span className={`${base} ${tone[RISK[level][1]]}`}><Dot />{RISK[level][0]}</span>
