import {
  ArrowLeftIcon, ArrowRightIcon, ArrowTopRightIcon, BackpackIcon, CalendarIcon,
  CardStackIcon, FileTextIcon, PaperPlaneIcon,
  ChatBubbleIcon, CheckCircledIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon,
  ChevronRightIcon, ChevronUpIcon, CounterClockwiseClockIcon, Cross2Icon, CubeIcon, DashboardIcon, EnterIcon,
  ExitIcon, HeartIcon, HomeIcon, ImageIcon, LockClosedIcon, MagnifyingGlassIcon,
  MixerHorizontalIcon, HamburgerMenuIcon, PersonIcon, PinLeftIcon, PlusIcon,
  QuestionMarkCircledIcon, RocketIcon, SizeIcon, StarIcon, TokensIcon, ZoomInIcon,
} from "@radix-ui/react-icons";
import type { ComponentProps } from "react";
const icons = {
  grid: DashboardIcon, users: PersonIcon, arrow: ArrowTopRightIcon,
  arrowLeft: ArrowLeftIcon, arrowRight: ArrowRightIcon, chevron: ChevronRightIcon,
  chevronDown: ChevronDownIcon, chevronLeft: ChevronLeftIcon, chevronUp: ChevronUpIcon,
  collapse: PinLeftIcon, search: MagnifyingGlassIcon, store: BackpackIcon,
  logout: ExitIcon, menu: HamburgerMenuIcon, close: Cross2Icon, spark: StarIcon,
  home: HomeIcon, shield: LockClosedIcon, check: CheckIcon, success: CheckCircledIcon,
  plus: PlusIcon, expand: SizeIcon, image: ImageIcon, calendar: CalendarIcon,
  heart: HeartIcon, chat: ChatBubbleIcon, sliders: MixerHorizontalIcon, bag: BackpackIcon,
  box: CubeIcon, dress: BackpackIcon, diamond: TokensIcon, truck: RocketIcon,
  help: QuestionMarkCircledIcon, enter: EnterIcon, zoom: ZoomInIcon,
  history: CounterClockwiseClockIcon, booking: FileTextIcon, payment: CardStackIcon, delivery: PaperPlaneIcon,
};
export type IconName = keyof typeof icons;
export function Icon({ name, className = "", ...props }: { name: IconName } & ComponentProps<typeof PlusIcon>) {
  const Component = icons[name];
  return <Component className={["inline-block size-4 shrink-0 align-middle", className].filter(Boolean).join(" ")} aria-hidden="true" focusable="false" {...props} />;
}
