import type { Config } from "tailwindcss";

/**
 * 클로드(Anthropic) 팔레트.
 * 회색 대신 따뜻한 크림 중성색을 쓴다 — 순수 회색은 화면이 차갑고 밋밋해 보인다.
 *
 * 액센트는 브랜드 오렌지 #d97757을 그대로 쓰지 않고 한 단계 어둡게(#c0603c) 쓴다.
 * 원색은 흰 글자 대비가 3:1 근처라 버튼 배경으로 쓰면 글자가 안 읽힌다.
 * 밝은 원색은 점·마크처럼 글자가 안 올라가는 곳(accent-bright)에만.
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
        ground: "#faf9f5",
        surface: "#ffffff",
        sunk: "#f5f4ed",
        line: {
          DEFAULT: "#e6e4da",
          soft: "#efede4",
          strong: "#d3d0c2",
        },
        ink: {
          DEFAULT: "#141413",
          2: "#3f3e3a",
          3: "#6e6c64",
          4: "#9d9a8f",
        },
        accent: {
          DEFAULT: "#c0603c",
          bright: "#d97757",
          soft: "#f9efe9",
          line: "#eed8cb",
        },
        critical: {
          DEFAULT: "#a33a30",
          soft: "#fbeeec",
          line: "#f0d5d0",
        },
        warn: {
          DEFAULT: "#8a5a12",
          soft: "#fbf3e4",
          line: "#eeddbe",
        },
        good: {
          DEFAULT: "#556b3e",
          soft: "#f0f3ea",
          line: "#dae0cc",
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
        card: "0 1px 2px rgba(20, 20, 19, .04)",
        raised: "0 2px 6px rgba(20, 20, 19, .06), 0 1px 2px rgba(20, 20, 19, .04)",
        pop: "0 8px 24px rgba(20, 20, 19, .10), 0 2px 6px rgba(20, 20, 19, .06)",
      },
      borderRadius: {
        DEFAULT: "8px",
        md: "10px",
        lg: "12px",
        xl: "16px",
      },
    },
  },
  plugins: [],
};

export default config;
