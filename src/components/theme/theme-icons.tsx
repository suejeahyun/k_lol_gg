import { SERVICE_BRAND } from "@/lib/service-brand";
import {
  Home as LineHome,
  UserRound as LineUserRound,
  UsersRound as LineUsersRound,
  UserPlus as LineUserPlus,
  UserCheck as LineUserCheck,
  UserSearch as LineUserSearch,
  LogIn as LineLogIn,
  LogOut as LineLogOut,
  Menu as LineMenu,
  Search as LineSearch,
  SearchX as LineSearchX,
  MessagesSquare as LineMessagesSquare,
  MessageCircleMore as LineMessageCircleMore,
  MessageCircleQuestion as LineMessageCircleQuestion,
  Bot as LineBot,
  BrainCircuit as LineBrainCircuit,
  Swords as LineSwords,
  Gamepad2 as LineGamepad2,
  Trophy as LineTrophy,
  Crown as LineCrown,
  Medal as LineMedal,
  Star as LineStar,
  Sparkles as LineSparkles,
  Dices as LineDices,
  Coins as LineCoins,
  Scale as LineScale,
  Gavel as LineGavel,
  PartyPopper as LinePartyPopper,
  CalendarDays as LineCalendarDays,
  CalendarCheck2 as LineCalendarCheck2,
  CalendarClock as LineCalendarClock,
  Clock3 as LineClock3,
  ShieldCheck as LineShieldCheck,
  ShieldX as LineShieldX,
  ShieldAlert as LineShieldAlert,
  LockKeyhole as LineLockKeyhole,
  KeyRound as LineKeyRound,
  AlertTriangle as LineAlertTriangle,
  CircleAlert as LineCircleAlert,
  Info as LineInfo,
  CheckCircle2 as LineCheckCircle2,
  Check as LineCheck,
  X as LineX,
  Plus as LinePlus,
  EyeOff as LineEyeOff,
  Radio as LineRadio,
  CloudSun as LineCloudSun,
  Activity as LineActivity,
  ArrowRight as LineArrowRight,
  ArrowLeft as LineArrowLeft,
  ChevronRight as LineChevronRight,
  ChevronLeft as LineChevronLeft,
  ChevronDown as LineChevronDown,
  RefreshCw as LineRefreshCw,
  RotateCcw as LineRotateCcw,
  Play as LinePlay,
  Pause as LinePause,
  Send as LineSend,
  Download as LineDownload,
  ExternalLink as LineExternalLink,
  Share2 as LineShare2,
  Link2 as LineLink2,
  Save as LineSave,
  Trash2 as LineTrash2,
  Database as LineDatabase,
  DatabaseZap as LineDatabaseZap,
  Images as LineImages,
  ImageOff as LineImageOff,
  Clapperboard as LineClapperboard,
  FolderOpen as LineFolderOpen,
  Archive as LineArchive,
  BookOpenCheck as LineBookOpenCheck,
  LibraryBig as LineLibraryBig,
  FilePlus2 as LineFilePlus2,
  FileCheck2 as LineFileCheck2,
  FileImage as LineFileImage,
  Clipboard as LineClipboard,
  ClipboardCheck as LineClipboardCheck,
  ClipboardPaste as LineClipboardPaste,
  Copy as LineCopy,
  Filter as LineFilter,
  Hash as LineHash,
  TrendingUp as LineTrendingUp,
  History as LineHistory,
  LayoutDashboard as LineLayoutDashboard,
  LoaderCircle as LineLoaderCircle,
  AppWindow as LineAppWindow,
  MonitorSmartphone as LineMonitorSmartphone,
  Smartphone as LineSmartphone,
  ScanLine as LineScanLine,
  Pencil as LinePencil,
  Gauge as LineGauge,
  GripVertical as LineGripVertical,
  SlidersHorizontal as LineSlidersHorizontal,
  CopyCheck as LineCopyCheck,
  CirclePlus as LineCirclePlus,
  type LucideIcon,
} from "lucide-react";
import type { ComponentProps } from "react";
import { themeIconMap, type ThemeIconName } from "./theme-icon-map";

type ThemeIconProps = ComponentProps<"svg"> & { size?: number | string };

function createThemeIcon(name: ThemeIconName, LineIcon: LucideIcon) {
  const { atlas, column, row } = themeIconMap[name];
  function ThemeIcon({ size = 24, className, style, children, ...props }: ThemeIconProps) {
    const labelled = Boolean(props["aria-label"] || props["aria-labelledby"]);
    if (SERVICE_BRAND.id === "nexus" || SERVICE_BRAND.id === "hub") {
      return <LineIcon size={size} role={labelled ? "img" : undefined} aria-hidden={labelled ? undefined : true} focusable="false" {...props} data-theme-icon={name} className={className ? `theme-icon ${className}` : "theme-icon"} style={style}>{children}</LineIcon>;
    }
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox={`${column} ${row} 1 1`}
        role={labelled ? "img" : undefined}
        aria-hidden={labelled ? undefined : true}
        focusable="false"
        {...props}
        data-theme-icon={name}
        className={className ? `theme-icon ${className}` : "theme-icon"}
        style={{ ...style, overflow: "hidden" }}
      >
        {children}
        {/* The viewport keeps existing SVG sizing contracts; the artwork is a cached WebP image. */}
        <image href={`/images/theme/v1/${atlas}.webp`} width="4" height="4" preserveAspectRatio="none" aria-hidden="true" />
      </svg>
    );
  }
  ThemeIcon.displayName = name;
  return ThemeIcon;
}

export const Home = createThemeIcon("Home", LineHome);
export const UserRound = createThemeIcon("UserRound", LineUserRound);
export const UsersRound = createThemeIcon("UsersRound", LineUsersRound);
export const UserPlus = createThemeIcon("UserPlus", LineUserPlus);
export const UserCheck = createThemeIcon("UserCheck", LineUserCheck);
export const UserSearch = createThemeIcon("UserSearch", LineUserSearch);
export const LogIn = createThemeIcon("LogIn", LineLogIn);
export const LogOut = createThemeIcon("LogOut", LineLogOut);
export const Menu = createThemeIcon("Menu", LineMenu);
export const Search = createThemeIcon("Search", LineSearch);
export const SearchX = createThemeIcon("SearchX", LineSearchX);
export const MessagesSquare = createThemeIcon("MessagesSquare", LineMessagesSquare);
export const MessageCircleMore = createThemeIcon("MessageCircleMore", LineMessageCircleMore);
export const MessageCircleQuestion = createThemeIcon("MessageCircleQuestion", LineMessageCircleQuestion);
export const Bot = createThemeIcon("Bot", LineBot);
export const BrainCircuit = createThemeIcon("BrainCircuit", LineBrainCircuit);
export const Swords = createThemeIcon("Swords", LineSwords);
export const Gamepad2 = createThemeIcon("Gamepad2", LineGamepad2);
export const Trophy = createThemeIcon("Trophy", LineTrophy);
export const Crown = createThemeIcon("Crown", LineCrown);
export const Medal = createThemeIcon("Medal", LineMedal);
export const Star = createThemeIcon("Star", LineStar);
export const Sparkles = createThemeIcon("Sparkles", LineSparkles);
export const Dices = createThemeIcon("Dices", LineDices);
export const Coins = createThemeIcon("Coins", LineCoins);
export const Scale = createThemeIcon("Scale", LineScale);
export const Gavel = createThemeIcon("Gavel", LineGavel);
export const PartyPopper = createThemeIcon("PartyPopper", LinePartyPopper);
export const CalendarDays = createThemeIcon("CalendarDays", LineCalendarDays);
export const CalendarCheck2 = createThemeIcon("CalendarCheck2", LineCalendarCheck2);
export const CalendarClock = createThemeIcon("CalendarClock", LineCalendarClock);
export const Clock3 = createThemeIcon("Clock3", LineClock3);
export const ShieldCheck = createThemeIcon("ShieldCheck", LineShieldCheck);
export const ShieldX = createThemeIcon("ShieldX", LineShieldX);
export const ShieldAlert = createThemeIcon("ShieldAlert", LineShieldAlert);
export const LockKeyhole = createThemeIcon("LockKeyhole", LineLockKeyhole);
export const KeyRound = createThemeIcon("KeyRound", LineKeyRound);
export const AlertTriangle = createThemeIcon("AlertTriangle", LineAlertTriangle);
export const CircleAlert = createThemeIcon("CircleAlert", LineCircleAlert);
export const Info = createThemeIcon("Info", LineInfo);
export const CheckCircle2 = createThemeIcon("CheckCircle2", LineCheckCircle2);
export const Check = createThemeIcon("Check", LineCheck);
export const X = createThemeIcon("X", LineX);
export const Plus = createThemeIcon("Plus", LinePlus);
export const EyeOff = createThemeIcon("EyeOff", LineEyeOff);
export const Radio = createThemeIcon("Radio", LineRadio);
export const CloudSun = createThemeIcon("CloudSun", LineCloudSun);
export const Activity = createThemeIcon("Activity", LineActivity);
export const ArrowRight = createThemeIcon("ArrowRight", LineArrowRight);
export const ArrowLeft = createThemeIcon("ArrowLeft", LineArrowLeft);
export const ChevronRight = createThemeIcon("ChevronRight", LineChevronRight);
export const ChevronLeft = createThemeIcon("ChevronLeft", LineChevronLeft);
export const ChevronDown = createThemeIcon("ChevronDown", LineChevronDown);
export const RefreshCw = createThemeIcon("RefreshCw", LineRefreshCw);
export const RotateCcw = createThemeIcon("RotateCcw", LineRotateCcw);
export const Play = createThemeIcon("Play", LinePlay);
export const Pause = createThemeIcon("Pause", LinePause);
export const Send = createThemeIcon("Send", LineSend);
export const Download = createThemeIcon("Download", LineDownload);
export const ExternalLink = createThemeIcon("ExternalLink", LineExternalLink);
export const Share2 = createThemeIcon("Share2", LineShare2);
export const Link2 = createThemeIcon("Link2", LineLink2);
export const Save = createThemeIcon("Save", LineSave);
export const Trash2 = createThemeIcon("Trash2", LineTrash2);
export const Database = createThemeIcon("Database", LineDatabase);
export const DatabaseZap = createThemeIcon("DatabaseZap", LineDatabaseZap);
export const Images = createThemeIcon("Images", LineImages);
export const ImageOff = createThemeIcon("ImageOff", LineImageOff);
export const Clapperboard = createThemeIcon("Clapperboard", LineClapperboard);
export const FolderOpen = createThemeIcon("FolderOpen", LineFolderOpen);
export const Archive = createThemeIcon("Archive", LineArchive);
export const BookOpenCheck = createThemeIcon("BookOpenCheck", LineBookOpenCheck);
export const LibraryBig = createThemeIcon("LibraryBig", LineLibraryBig);
export const FilePlus2 = createThemeIcon("FilePlus2", LineFilePlus2);
export const FileCheck2 = createThemeIcon("FileCheck2", LineFileCheck2);
export const FileImage = createThemeIcon("FileImage", LineFileImage);
export const Clipboard = createThemeIcon("Clipboard", LineClipboard);
export const ClipboardCheck = createThemeIcon("ClipboardCheck", LineClipboardCheck);
export const ClipboardPaste = createThemeIcon("ClipboardPaste", LineClipboardPaste);
export const Copy = createThemeIcon("Copy", LineCopy);
export const Filter = createThemeIcon("Filter", LineFilter);
export const Hash = createThemeIcon("Hash", LineHash);
export const TrendingUp = createThemeIcon("TrendingUp", LineTrendingUp);
export const History = createThemeIcon("History", LineHistory);
export const LayoutDashboard = createThemeIcon("LayoutDashboard", LineLayoutDashboard);
export const LoaderCircle = createThemeIcon("LoaderCircle", LineLoaderCircle);
export const AppWindow = createThemeIcon("AppWindow", LineAppWindow);
export const MonitorSmartphone = createThemeIcon("MonitorSmartphone", LineMonitorSmartphone);
export const Smartphone = createThemeIcon("Smartphone", LineSmartphone);
export const ScanLine = createThemeIcon("ScanLine", LineScanLine);
export const Pencil = createThemeIcon("Pencil", LinePencil);
export const Gauge = createThemeIcon("Gauge", LineGauge);
export const GripVertical = createThemeIcon("GripVertical", LineGripVertical);
export const SlidersHorizontal = createThemeIcon("SlidersHorizontal", LineSlidersHorizontal);
export const CopyCheck = createThemeIcon("CopyCheck", LineCopyCheck);
export const CirclePlus = createThemeIcon("CirclePlus", LineCirclePlus);
export const Users = UsersRound;
export const UserRoundPlus = UserPlus;
export const UserRoundCheck = UserCheck;
export const UserRoundSearch = UserSearch;
export const CalendarCheck = CalendarCheck2;
export const AlertCircle = CircleAlert;
