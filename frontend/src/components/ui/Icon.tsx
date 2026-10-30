import type { SVGProps } from 'react';

const PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10',
  users:
    'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4.5 20a7.5 7.5 0 0 1 15 0',
  calendar:
    'M7 3v3M17 3v3M4 8.5h16M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5z',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  wallet:
    'M4 7.5A2.5 2.5 0 0 1 6.5 5H19v3M4 7.5V17a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 1 4 7.5zM16 13.5h.01',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  shield: 'M12 3 5 6v5.5c0 4.4 2.9 7.6 7 9.5 4.1-1.9 7-5.1 7-9.5V6zM9.5 12l2 2 3.5-4',
  settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6',
  tooth:
    'M8 4C5.8 4 4 5.6 4 8.2c0 2 .8 3.4 1.4 5.2.6 1.8.5 3.2 1.1 5 .4 1.2 1.6 1.6 2.3.6.9-1.2.9-3.4 2.2-3.4s1.3 2.2 2.2 3.4c.7 1 1.9.6 2.3-.6.6-1.8.5-3.2 1.1-5C19.2 11.6 20 10.2 20 8.2 20 5.6 18.2 4 16 4c-1.6 0-2.6.8-4 .8S9.6 4 8 4z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 4 3 19.5h18zM12 10v4.5M12 17.5h.01',
  chevronLeft: 'M14.5 5 8 12l6.5 7',
  chevronRight: 'M9.5 5 16 12l-6.5 7',
  logout: 'M10 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H10M15 8l4 4-4 4M19 12H9',
  menu: 'M4 7h16M4 12h16M4 17h16',
  file: 'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5',
  building:
    'M5 20V5.5A1.5 1.5 0 0 1 6.5 4h7A1.5 1.5 0 0 1 15 5.5V20M15 9h3.5a1.5 1.5 0 0 1 1.5 1.5V20M3 20h18M8.5 8h3M8.5 12h3M8.5 16h3',
  download: 'M12 4v11M7.5 11 12 15.5 16.5 11M5 19h14',
  bell: 'M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
  box: 'M12 3 4 7v10l8 4 8-4V7zM4 7l8 4 8-4M12 11v10',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM14.5 9.2c-.4-.8-1.4-1.2-2.5-1.2-1.4 0-2.5.7-2.5 1.8s1 1.5 2.5 1.9c1.5.4 2.5.8 2.5 1.9S13.400 15.500 12 15.500c-1.100 0-2.100-.4-2.500-1.200M12 6.500V8M12 15.500v2',
  chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
}

/** Iconos de trazo fino (24 px) en línea con la estética sobria de la aplicación. */
export function Icon({ name, className = 'h-5 w-5', ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
