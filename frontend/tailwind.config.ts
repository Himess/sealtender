import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        heading: ["var(--font-space-grotesk)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
      },
      colors: {
        background: "#08090E",
        "surface-card": "#0D0F14",
        "surface-hover": "#151820",
        "surface-input": "#0C0D14",
        "surface-sidebar": "#0D0F14",
        border: "#1E2230",
        "accent-green": "#00E87B",
        "accent-red": "#FF4444",
        "accent-blue": "#4A9FFF",
        "accent-amber": "#FFB800",
        "accent-purple": "#A855F7",
        "status-amber": "#FFB800",
        "status-blue": "#4A9FFF",
        "text-primary": "#F0F0F0",
        "text-secondary": "#888888",
        "text-muted": "#666666",
        "text-disabled": "#555555",
      },
    },
  },
  plugins: [],
};

export default config;
