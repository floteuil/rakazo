export const tokens = {
  page: "#050506",
  sidebar: "#0B0B0C",
  main: "#0D0D0E",
  panel: "#0A0A0B",
  hairline: "#171719",
  hairlineStrong: "#202023",
  surface: "#141416",
  surface2: "#1A1A1D",
  ink: "#ECECEE",
  body: "#DFDFE2",
  muted: "#85858A",
  muted2: "#6C6C70",
  cream: "#F1F1EF",
  creamInk: "#1A1A1A",
  accent: "#3EC5A8",
  danger: "#EF4444",
  error: "#EF4444",
  errorInk: "#FCA5A5",
  success: "#30A24B",
  successSoft: "#4ECB71",
} as const;

export const errorTokens = {
  error: "#EF4444",
  errorSurface: "rgba(239, 68, 68, 0.10)",
  errorBorder: "rgba(239, 68, 68, 0.25)",
  errorInk: "#FCA5A5",
  destructive: "0 84% 60%",
} as const;

export const botColors = [
  "#3EC5A8",
  "#F5A03C",
  "#6A6BF5",
  "#9B5CF6",
  "#3B82F6",
  "#F2622A",
  "#D9508A",
] as const;

export type Tokens = typeof tokens;
export type ErrorTokens = typeof errorTokens;

