import type { Config } from "tailwindcss";

/**
 * 스톡 회색을 그대로 쓰지 않고 액센트(잉크블루) 쪽으로 살짝 기운 중성색을 쓴다.
 * 순수 회색은 고른 티가 안 나고, 화면이 밋밋해 보이는 원인이 된다.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ground: "#f4f6f8",
        surface: "#ffffff",
        sunk: "#f7f9fb",
        line: {
          DEFAULT: "#e2e7ec",
          soft: "#eef1f5",
          strong: "#cbd3dc",
        },
        ink: {
          DEFAULT: "#13171d",
          2: "#3b434e",
          3: "#67707c",
          4: "#98a1ad",
        },
        accent: {
          DEFAULT: "#1b4d7e",
          soft: "#eaf1f8",
          line: "#c2d6e8",
        },
        critical: {
          DEFAULT: "#a72833",
          soft: "#fdeef0",
          line: "#f2ccd1",
        },
        warn: {
          DEFAULT: "#8d5c0c",
          soft: "#fdf3e3",
          line: "#eeddbd",
        },
        good: {
          DEFAULT: "#176a47",
          soft: "#e9f5ef",
          line: "#c2e0d2",
        },
      },
      fontFamily: {
        sans: [
          "Pretendard Variable",
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Segoe UI",
          "sans-serif",
        ],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(19, 23, 29, .05)",
        raised: "0 1px 3px rgba(19, 23, 29, .07), 0 1px 2px rgba(19, 23, 29, .04)",
      },
      borderRadius: {
        DEFAULT: "6px",
        md: "7px",
        lg: "9px",
      },
    },
  },
  plugins: [],
};

export default config;
