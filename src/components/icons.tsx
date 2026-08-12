import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {children}
    </svg>
  );
}

const strokeProps = { stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 1.7 };

export function RadarIcon(props: IconProps) {
  return <Icon {...props}><path {...strokeProps} d="M12 20a8 8 0 1 0-8-8" /><path {...strokeProps} d="M12 16a4 4 0 1 0-4-4" /><path {...strokeProps} d="M12 12 7 7" /><circle cx="12" cy="12" fill="currentColor" r="1.7" /></Icon>;
}

export function ArchiveIcon(props: IconProps) {
  return <Icon {...props}><path {...strokeProps} d="M4 7.5h16v11H4z" /><path {...strokeProps} d="M3 4h18v3.5H3zM9 12h6" /></Icon>;
}

export function PulseIcon(props: IconProps) {
  return <Icon {...props}><path {...strokeProps} d="M3 12h4l2.1-5.3L13 18l2.3-6H21" /></Icon>;
}

export function SettingsIcon(props: IconProps) {
  return <Icon {...props}><circle {...strokeProps} cx="12" cy="12" r="3" /><path {...strokeProps} d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.54 2.54-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56v.09h-3.58v-.09A1.7 1.7 0 0 0 9.68 19a1.7 1.7 0 0 0-1.88.34l-.06.06-2.54-2.54.06-.06A1.7 1.7 0 0 0 5.6 15a1.7 1.7 0 0 0-1.56-1.03h-.09v-3.58h.09A1.7 1.7 0 0 0 5.6 9.36a1.7 1.7 0 0 0-.34-1.88L5.2 7.42l2.54-2.54.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.56v-.09h3.58v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.54 2.54-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.03h.09v3.58h-.09A1.7 1.7 0 0 0 19.4 15Z" /></Icon>;
}

export function ChevronIcon(props: IconProps) {
  return <Icon {...props}><path {...strokeProps} d="m9 5 7 7-7 7" /></Icon>;
}

export function ExternalIcon(props: IconProps) {
  return <Icon {...props}><path {...strokeProps} d="M14 5h5v5M19 5l-8 8M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></Icon>;
}

export function FilterIcon(props: IconProps) {
  return <Icon {...props}><path {...strokeProps} d="M4 6h16M7 12h10M10 18h4" /><circle cx="7" cy="6" fill="var(--bg)" r="1.6" stroke="currentColor" strokeWidth="1.5" /><circle cx="16" cy="12" fill="var(--bg)" r="1.6" stroke="currentColor" strokeWidth="1.5" /><circle cx="12" cy="18" fill="var(--bg)" r="1.6" stroke="currentColor" strokeWidth="1.5" /></Icon>;
}

export function SearchIcon(props: IconProps) {
  return <Icon {...props}><circle {...strokeProps} cx="10.5" cy="10.5" r="5.5" /><path {...strokeProps} d="m15 15 4 4" /></Icon>;
}

export function CheckIcon(props: IconProps) {
  return <Icon {...props}><path {...strokeProps} d="m5 12 4.3 4.3L19 6.7" /></Icon>;
}

export function PlusIcon(props: IconProps) {
  return <Icon {...props}><path {...strokeProps} d="M12 5v14M5 12h14" /></Icon>;
}

export function MenuIcon(props: IconProps) {
  return <Icon {...props}><path {...strokeProps} d="M4 7h16M4 12h16M4 17h16" /></Icon>;
}

export function ArrowLeftIcon(props: IconProps) {
  return <Icon {...props}><path {...strokeProps} d="m14 6-6 6 6 6" /></Icon>;
}

export function SunIcon(props: IconProps) {
  return <Icon {...props}><circle {...strokeProps} cx="12" cy="12" r="3.4" /><path {...strokeProps} d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.72 5.28l-1.41 1.41M6.69 17.31l-1.41 1.41M18.72 18.72l-1.41-1.41M6.69 6.69 5.28 5.28" /></Icon>;
}

export function MoonIcon(props: IconProps) {
  return <Icon {...props}><path {...strokeProps} d="M20 15.3A8.2 8.2 0 0 1 8.7 4 8.25 8.25 0 1 0 20 15.3Z" /></Icon>;
}
