import {
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  Inbox,
  Info,
  Menu,
  Monitor,
  Moon,
  Sun,
  TriangleAlert,
  WifiOff,
  X,
} from 'lucide-vue-next'

// The one icon set (lucide). One concept, one icon: a new concept adds an entry here, never a
// second set. The names are the app's, so swapping a glyph touches this file only.
export const ICONS = {
  menu: Menu,
  check: Check,
  'chevron-down': ChevronDown,
  close: X,
  sun: Sun,
  moon: Moon,
  monitor: Monitor,
  'check-circle': CircleCheck,
  'alert-circle': CircleAlert,
  'alert-triangle': TriangleAlert,
  info: Info,
  'wifi-off': WifiOff,
  eye: Eye,
  'eye-off': EyeOff,
  inbox: Inbox,
} as const

export type IconName = keyof typeof ICONS
