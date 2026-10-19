/** Inline SVG icon set (no icon font, no third-party requests). */
const PATHS: Record<string, string> = {
  play: "M8 5v14l11-7z",
  pause: "M6 5h4v14H6zM14 5h4v14h-4z",
  volume: "M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z",
  "volume-off": "M4 9v6h4l5 4V5L8 9H4zm16.6 3 2.1-2.1-1.4-1.4-2.1 2.1-2.1-2.1-1.4 1.4 2.1 2.1-2.1 2.1 1.4 1.4 2.1-2.1 2.1 2.1 1.4-1.4z",
  fullscreen: "M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z",
  pip: "M3 5h18v14H3V5zm2 2v10h14V7H5zm7 5h6v4h-6v-4z",
  cc: "M3 5h18v14H3V5zm2 2v10h14V7H5zm2 3h4v1.5H8.5v1h2.5V14H7v-4zm6 0h4v1.5h-2.5v1H17V14h-4v-4z",
  airplay: "M3 4h18v12h-4l-1.5-2H19V6H5v8h3.5L7 16H3V4zm9 9 6 7H6l6-7z",
  tv: "M3 5h18v12H3V5zm2 2v8h14V7H5zm3 12h8v2H8v-2z",
  expand: "M14 3h7v7h-2V6.4l-5.3 5.3-1.4-1.4L17.6 5H14V3zM3 14h2v3.6l5.3-5.3 1.4 1.4L6.4 19H10v2H3v-7z",
  collapse: "M20.3 2.3 15 7.6V4h-2v7h7V9h-3.6l5.3-5.3-1.4-1.4zM4 13v2h3.6l-5.3 5.3 1.4 1.4L9 16.4V20h2v-7H4z",
  star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z",
  search: "M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z",
  live: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM5.6 5.6l1.4 1.4a7 7 0 0 0 0 10l-1.4 1.4a9 9 0 0 1 0-12.8zm12.8 0a9 9 0 0 1 0 12.8L17 17a7 7 0 0 0 0-10z",
  grid: "M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z",
  back: "M15.4 4.6 14 3.2 5.2 12l8.8 8.8 1.4-1.4L8 12z",
  close: "M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z",
  info: "M11 7h2v2h-2V7zm0 4h2v6h-2v-6zm1-9a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16z",
  ball: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 4.2-3.3 2.4 1.3 3.9h4l1.3-3.9L12 6.2z",
  video: "M3 6h12v12H3V6zm14 4 4-3v10l-4-3v-4z",
};

export function Icon({ name, size = 22, label }: { name: keyof typeof PATHS | string; size?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label}>
      <path d={PATHS[name] ?? PATHS.info} fillRule="evenodd" />
    </svg>
  );
}
