/**
 * Wrapper centralizado pra ícones Lucide.
 *
 * O handoff de design usa nomes curtos (`plus`, `more`, `chevron-down`,
 * `tag-ai` etc) — este wrapper mapeia esses nomes pros componentes
 * reais do `lucide-react`. Vantagens:
 *
 *  - Renomear/trocar 1 ícone num só lugar
 *  - Tree-shaking funciona (cada ícone só é incluído se usado)
 *  - Default props consistentes (stroke 2px, line-cap round)
 *  - Permite trocar `lucide-react` por outra lib no futuro sem refactor
 *
 * Uso:
 *   import { Icon } from '@/components/icons';
 *   <Icon name="plus" size={16} />
 */

import {
  Plus, X, MoreHorizontal, ChevronDown, ChevronLeft, ChevronRight,
  Check, Play, Square, Search, Calendar, Building2, FolderClosed, Users,
  LayoutGrid, List, Columns3, Target, Inbox, FileText, Timer,
  SlidersHorizontal, Download, HelpCircle, Sun, Moon, Bell, ArrowUp, ArrowDown,
  ArrowDownUp, RefreshCw, Trash2, Edit3, Eye, EyeOff, Filter, ChevronsUpDown,
  ListFilter, MessageSquare, Paperclip, History, Pause, AtSign, Archive,
  Lock, AlertCircle, CheckCircle2, Info, ArrowRight, LogOut, Settings,
  Activity, BarChart2, Flag, Clock, Hourglass, Bot, Send, AlertTriangle, UserPlus,
  Megaphone, Copy,
  type LucideIcon, type LucideProps,
} from 'lucide-react';

type IconName =
  | 'plus' | 'x' | 'more' | 'chevron-down' | 'chevron-left' | 'chevron-right'
  | 'check' | 'play' | 'square' | 'search' | 'calendar' | 'building'
  | 'folder' | 'users' | 'grid' | 'list' | 'columns' | 'target' | 'inbox'
  | 'file' | 'timer' | 'sliders' | 'download' | 'help' | 'sun' | 'moon'
  | 'bell' | 'arrow-up' | 'arrow-down' | 'sort' | 'refresh' | 'tag-ai'
  | 'trash' | 'edit' | 'eye' | 'eye-off' | 'filter' | 'chevrons-up-down'
  | 'list-filter' | 'comment' | 'paperclip' | 'history' | 'pause' | 'mention'
  | 'archive' | 'lock' | 'alert' | 'check-circle' | 'info' | 'arrow-right'
  | 'logout' | 'settings' | 'activity' | 'bar-chart-2' | 'flag' | 'clock'
  | 'hourglass' | 'bot' | 'send' | 'alert-triangle' | 'user-plus'
  | 'megaphone' | 'copy';

const MAP: Record<IconName, LucideIcon> = {
  plus: Plus,
  x: X,
  more: MoreHorizontal,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  check: Check,
  play: Play,
  square: Square,
  search: Search,
  calendar: Calendar,
  building: Building2,
  folder: FolderClosed,
  users: Users,
  grid: LayoutGrid,
  list: List,
  columns: Columns3,
  target: Target,
  inbox: Inbox,
  file: FileText,
  timer: Timer,
  sliders: SlidersHorizontal,
  download: Download,
  help: HelpCircle,
  sun: Sun,
  moon: Moon,
  bell: Bell,
  'arrow-up': ArrowUp,
  'arrow-down': ArrowDown,
  sort: ArrowDownUp,
  refresh: RefreshCw,
  'tag-ai': RefreshCw,   // chip "criada por IA" usa o mesmo glifo
  trash: Trash2,
  edit: Edit3,
  eye: Eye,
  'eye-off': EyeOff,
  filter: Filter,
  'chevrons-up-down': ChevronsUpDown,
  'list-filter': ListFilter,
  comment: MessageSquare,
  paperclip: Paperclip,
  history: History,
  pause: Pause,
  mention: AtSign,
  archive: Archive,
  lock: Lock,
  alert: AlertCircle,
  'check-circle': CheckCircle2,
  info: Info,
  'arrow-right': ArrowRight,
  logout: LogOut,
  settings: Settings,
  activity: Activity,
  'bar-chart-2': BarChart2,
  flag: Flag,
  clock: Clock,
  hourglass: Hourglass,
  bot: Bot,
  send: Send,
  'alert-triangle': AlertTriangle,
  'user-plus': UserPlus,
  megaphone: Megaphone,
  copy: Copy,
};

interface IconProps extends Omit<LucideProps, 'size'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 16, strokeWidth = 2, ...rest }: IconProps) {
  const Cmp = MAP[name];
  if (!Cmp) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[Icon] nome desconhecido: ${name}`);
    }
    return null;
  }
  return <Cmp size={size} strokeWidth={strokeWidth} aria-hidden="true" {...rest} />;
}

export type { IconName };
