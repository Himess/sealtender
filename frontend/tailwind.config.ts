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
        "surface-card": "#0F1117",
        "surface-hover": "#151820",
        "surface-input": "#0C0D14",
        "surface-sidebar": "#0A0B10",
        border: "#1A1D27",
        "accent-green": "#00E87B",
        "accent-red": "#FF4444",
        "accent-blue": "#4A9FFF",
        "accent-amber": "#FFB800",
        "accent-purple": "#A855F7",
        "status-amber": "#FFB800",
        "status-blue": "#4A9FFF",
        "text-primary": "#F0F2F5",
        "text-secondary": "#A0A8B8",
        "text-muted": "#6B7280",
        "text-disabled": "#3A3F4B",
      },
    },
  },
  plugins: [],
};

export default config;
