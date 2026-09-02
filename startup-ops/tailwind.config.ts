import type { Config } from "tailwindcss";

/**
 * 팔레트.
 *
 * 바탕은 아주 옅은 중성 회색, 카드는 흰색, 글자는 거의 검정.
 * 색은 "의미가 있는 곳"에만 쓴다 — 선택·링크는 남색(accent), 좋음은 초록, 급함은 빨강.
 * 예전 크림 톤은 따뜻했지만 카드와 바탕의 경계가 흐려 화면이 뭉개졌다.
 * 회색 바탕 위 흰 카드가 경계를 그려 주므로 테두리를 더 옅게 쓸 수 있다.
 *
 * 토큰 이름은 그대로 두었다 (ground/surface/sunk/line/ink/accent/critical/warn/good).
 * 이름을 바꾸면 모든 컴포넌트를 손대야 하는데, 값만 바꿔도 화면 전체가 같이 바뀐다.
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
        ground: "#f3f3f4",
        surface: "#ffffff",
        sunk: "#f7f7f8",
        line: {
          DEFAULT: "#e6e6e9",
          soft: "#efeff1",
          strong: "#d5d5da",
        },
        ink: {
          DEFAULT: "#141416",
          2: "#3b3b40",
          3: "#6c6c74",
          4: "#9b9ba3",
        },
        /** 선택·링크·주요 버튼. 검정 버튼(primary)과 구분되는 한 가지 색. */
        accent: {
          DEFAULT: "#4f4fd0",
          bright: "#6c6cf0",
          soft: "#eeeefc",
          line: "#d4d4f5",
        },
        /** 가장 중요한 한 버튼. 화면에 하나만 있어야 한다. */
        primary: {
          DEFAULT: "#141416",
          hover: "#2a2a2e",
        },
        critical: {
          DEFAULT: "#c2372f",
          soft: "#fdeeec",
          line: "#f4cfcb",
        },
        warn: {
          DEFAULT: "#9a6200",
          soft: "#fff5df",
          line: "#f1dfae",
        },
        good: {
          DEFAULT: "#1a8a53",
          soft: "#e8f6ee",
          line: "#c5e6d3",
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
        card: "0 1px 2px rgba(20, 20, 22, .04), 0 0 0 1px rgba(20, 20, 22, .03)",
        raised: "0 2px 8px rgba(20, 20, 22, .06), 0 1px 2px rgba(20, 20, 22, .04)",
        pop: "0 12px 32px rgba(20, 20, 22, .12), 0 2px 6px rgba(20, 20, 22, .06)",
      },
      borderRadius: {
        DEFAULT: "8px",
        md: "10px",
        lg: "14px",
        xl: "18px",
      },
    },
  },
  plugins: [],
};

export default config;
