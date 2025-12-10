import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      keyframes: {
        "trick-from-top": {
          from: { transform: "translateY(-12px) scale(0.9)", opacity: "0" },
          to: { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        "trick-from-bottom": {
          from: { transform: "translateY(12px) scale(0.9)", opacity: "0" },
          to: { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        "trick-from-left": {
          from: { transform: "translateX(-12px) scale(0.9)", opacity: "0" },
          to: { transform: "translateX(0) scale(1)", opacity: "1" },
        },
        "trick-from-right": {
          from: { transform: "translateX(12px) scale(0.9)", opacity: "0" },
          to: { transform: "translateX(0) scale(1)", opacity: "1" },
        },
        "trick-winner-banner": {
          "0%": {
            transform: "translateY(-10px) scale(0.95)",
            opacity: "0",
          },
          "20%": {
            transform: "translateY(0) scale(1)",
            opacity: "1",
          },
          "80%": {
            transform: "translateY(0) scale(1)",
            opacity: "1",
          },
          "100%": {
            transform: "translateY(-8px) scale(0.95)",
            opacity: "0",
          },
        },
        "final-score-pop": {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "60%": { transform: "scale(1.05)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "backdrop-fade": {
          from: { opacity: "0" },
          to: { opacity: "0.75" },
        },
        "hand-shuffle": {
          "0%": { transform: "translateY(0)" },
          "20%": { transform: "translateY(-4px)" },
          "40%": { transform: "translateY(4px)" },
          "60%": { transform: "translateY(-2px)" },
          "80%": { transform: "translateY(2px)" },
          "100%": { transform: "translateY(0)" },
        },
      },
      animation: {
        "trick-from-top": "trick-from-top 0.22s ease-out",
        "trick-from-bottom": "trick-from-bottom 0.22s ease-out",
        "trick-from-left": "trick-from-left 0.22s ease-out",
        "trick-from-right": "trick-from-right 0.22s ease-out",
        "trick-winner-banner": "trick-winner-banner 1.8s ease-out",
        "final-score-pop": "final-score-pop 0.3s ease-out",
        "backdrop-fade": "backdrop-fade 0.25s ease-out",
        "hand-shuffle": "hand-shuffle 0.35s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
