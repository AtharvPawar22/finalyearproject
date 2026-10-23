import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#F8F9FA",
        surface: {
          DEFAULT: "#FFFFFF",
          secondary: "#F1F5F9",
          hover: "#F8FAFC",
        },
        border: {
          subtle: "#F1F5F9",
          DEFAULT: "#E2E8F0",
          strong: "#CBD5E1",
        },
        primary: {
          DEFAULT: "#0F172A",
          foreground: "#FFFFFF",
        },
        accent: {
          DEFAULT: "#0F766E",
          light: "#14B8A6",
          dark: "#115E59",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          '"Inter"',
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
        mono: [
          '"SF Mono"',
          "ui-monospace",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        subtle: "0 1px 2px 0 rgba(0, 0, 0, 0.03)",
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.02)",
        modal: "0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.03)",
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
        "3xl": "22px",
      },
    },
  },
  plugins: [],
};
export default config;
