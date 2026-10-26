// Ikony hracej plochy – jednoduché ťahy 1.8 px, farba podľa textu (currentColor).
import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "clock" | "swords" | "burst" | "return" | "spark" | "shield" | "swap" | "order" | "flag"
  | "exit" | "play" | "plus" | "eye" | "heart" | "question" | "alert" | "trash" | "hand" | "check";

const P: Record<IconName, ReactNode> = {
  clock: (<><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9.5 2.5h5" /></>),
  swords: (<><path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="m13 19 6-6M16 16l4 4M19 21l2-2" /><path d="M9.5 14.5 6 18M5 17l2 2M3 19l2 2" /><path d="M14.5 9.5 18 6V3h3v3l-3.5 3.5" /></>),
  burst: (<path d="M12 2.5 13.9 8l5.6-2-2.6 5.3 4.6 3.4-5.7.6.5 5.8L12 17.4 7.7 21.1l.5-5.8-5.7-.6 4.6-3.4L4.5 6l5.6 2Z" />),
  return: (<><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>),
  spark: (<path d="M12 3c.5 4.5 2.5 6.5 7 7-4.5.5-6.5 2.5-7 7-.5-4.5-2.5-6.5-7-7 4.5-.5 6.5-2.5 7-7Z" />),
  shield: (<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6Z" />),
  swap: (<><path d="M4 8h13l-3-3M20 16H7l3 3" /></>),
  order: (<><path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4" /></>),
  flag: (<><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>),
  exit: (<><path d="M14 4h5v16h-5" /><path d="M10 8l-4 4 4 4M6 12h10" /></>),
  play: (<path d="M7 4.5v15l12-7.5Z" />),
  plus: (<path d="M12 5v14M5 12h14" />),
  eye: (<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>),
  heart: (<path d="M12 20s-7.5-4.6-9.6-9.2C.9 7.4 3 3.5 6.7 3.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.3C19.5 15.4 12 20 12 20Z" />),
  question: (<><path d="M9 9.2a3 3 0 1 1 4.2 2.8c-.8.4-1.2 1-1.2 1.8v.7" /><circle cx="12" cy="18" r=".6" /></>),
  alert: (<><path d="M12 7v6" /><circle cx="12" cy="17" r=".6" /></>),
  trash: (<><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>),
  hand: (<><rect x="3" y="7" width="9" height="13" rx="1.5" transform="rotate(-10 7.5 13.5)" /><rect x="11" y="5" width="9" height="13" rx="1.5" transform="rotate(8 15.5 11.5)" /></>),
  check: (<path d="m5 12.5 4.5 4.5L19 7.5" />),
};

const FILLED: Partial<Record<IconName, true>> = { heart: true, play: true, spark: true };

export function Icon({ name, size = 16, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  const fill = FILLED[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke={fill ? "none" : "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className="gi"
      {...rest}
    >
      {P[name]}
    </svg>
  );
}
