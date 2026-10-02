import type { ComponentProps } from "react";
import { themeIconMap, type ThemeIconName } from "./theme-icon-map";

type ThemeIconProps = ComponentProps<"svg"> & { size?: number | string };

function createThemeIcon(name: ThemeIconName) {
  const { atlas, column, row } = themeIconMap[name];
  function ThemeIcon({ size = 24, className, style, children, ...props }: ThemeIconProps) {
    const labelled = Boolean(props["aria-label"] || props["aria-labelledby"]);
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

export const Home = createThemeIcon("Home");
export const UserRound = createThemeIcon("UserRound");
export const UsersRound = createThemeIcon("UsersRound");
export const UserPlus = createThemeIcon("UserPlus");
export const UserCheck = createThemeIcon("UserCheck");
export const UserSearch = createThemeIcon("UserSearch");
export const LogIn = createThemeIcon("LogIn");
export const LogOut = createThemeIcon("LogOut");
export const Menu = createThemeIcon("Menu");
export const Search = createThemeIcon("Search");
export const SearchX = createThemeIcon("SearchX");
export const MessagesSquare = createThemeIcon("MessagesSquare");
export const MessageCircleMore = createThemeIcon("MessageCircleMore");
export const MessageCircleQuestion = createThemeIcon("MessageCircleQuestion");
export const Bot = createThemeIcon("Bot");
export const BrainCircuit = createThemeIcon("BrainCircuit");
export const Swords = createThemeIcon("Swords");
export const Gamepad2 = createThemeIcon("Gamepad2");
export const Trophy = createThemeIcon("Trophy");
export const Crown = createThemeIcon("Crown");
export const Medal = createThemeIcon("Medal");
export const Star = createThemeIcon("Star");
export const Sparkles = createThemeIcon("Sparkles");
export const Dices = createThemeIcon("Dices");
export const Coins = createThemeIcon("Coins");
export const Scale = createThemeIcon("Scale");
export const Gavel = createThemeIcon("Gavel");
export const PartyPopper = createThemeIcon("PartyPopper");
export const CalendarDays = createThemeIcon("CalendarDays");
export const CalendarCheck2 = createThemeIcon("CalendarCheck2");
export const CalendarClock = createThemeIcon("CalendarClock");
export const Clock3 = createThemeIcon("Clock3");
export const ShieldCheck = createThemeIcon("ShieldCheck");
export const ShieldX = createThemeIcon("ShieldX");
export const ShieldAlert = createThemeIcon("ShieldAlert");
export const LockKeyhole = createThemeIcon("LockKeyhole");
export const KeyRound = createThemeIcon("KeyRound");
export const AlertTriangle = createThemeIcon("AlertTriangle");
export const CircleAlert = createThemeIcon("CircleAlert");
export const Info = createThemeIcon("Info");
export const CheckCircle2 = createThemeIcon("CheckCircle2");
export const Check = createThemeIcon("Check");
export const X = createThemeIcon("X");
export const Plus = createThemeIcon("Plus");
export const EyeOff = createThemeIcon("EyeOff");
export const Radio = createThemeIcon("Radio");
export const CloudSun = createThemeIcon("CloudSun");
export const Activity = createThemeIcon("Activity");
export const ArrowRight = createThemeIcon("ArrowRight");
export const ArrowLeft = createThemeIcon("ArrowLeft");
export const ChevronRight = createThemeIcon("ChevronRight");
export const ChevronLeft = createThemeIcon("ChevronLeft");
export const ChevronDown = createThemeIcon("ChevronDown");
export const RefreshCw = createThemeIcon("RefreshCw");
export const RotateCcw = createThemeIcon("RotateCcw");
export const Play = createThemeIcon("Play");
export const Pause = createThemeIcon("Pause");
export const Send = createThemeIcon("Send");
export const Download = createThemeIcon("Download");
export const ExternalLink = createThemeIcon("ExternalLink");
export const Share2 = createThemeIcon("Share2");
export const Link2 = createThemeIcon("Link2");
export const Save = createThemeIcon("Save");
export const Trash2 = createThemeIcon("Trash2");
export const Database = createThemeIcon("Database");
export const DatabaseZap = createThemeIcon("DatabaseZap");
export const Images = createThemeIcon("Images");
export const ImageOff = createThemeIcon("ImageOff");
export const Clapperboard = createThemeIcon("Clapperboard");
export const FolderOpen = createThemeIcon("FolderOpen");
export const Archive = createThemeIcon("Archive");
export const BookOpenCheck = createThemeIcon("BookOpenCheck");
export const LibraryBig = createThemeIcon("LibraryBig");
export const FilePlus2 = createThemeIcon("FilePlus2");
export const FileCheck2 = createThemeIcon("FileCheck2");
export const FileImage = createThemeIcon("FileImage");
export const Clipboard = createThemeIcon("Clipboard");
export const ClipboardCheck = createThemeIcon("ClipboardCheck");
export const ClipboardPaste = createThemeIcon("ClipboardPaste");
export const Copy = createThemeIcon("Copy");
export const Filter = createThemeIcon("Filter");
export const Hash = createThemeIcon("Hash");
export const TrendingUp = createThemeIcon("TrendingUp");
export const History = createThemeIcon("History");
export const LayoutDashboard = createThemeIcon("LayoutDashboard");
export const LoaderCircle = createThemeIcon("LoaderCircle");
export const AppWindow = createThemeIcon("AppWindow");
export const MonitorSmartphone = createThemeIcon("MonitorSmartphone");
export const Smartphone = createThemeIcon("Smartphone");
export const ScanLine = createThemeIcon("ScanLine");
export const Pencil = createThemeIcon("Pencil");
export const Gauge = createThemeIcon("Gauge");
export const GripVertical = createThemeIcon("GripVertical");
export const SlidersHorizontal = createThemeIcon("SlidersHorizontal");
export const CopyCheck = createThemeIcon("CopyCheck");
export const CirclePlus = createThemeIcon("CirclePlus");
export const Users = UsersRound;
export const UserRoundPlus = UserPlus;
export const UserRoundCheck = UserCheck;
export const UserRoundSearch = UserSearch;
export const CalendarCheck = CalendarCheck2;
export const AlertCircle = CircleAlert;
