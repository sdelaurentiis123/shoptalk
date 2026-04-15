import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#FFFFFF",
        background: "#F5F5F7",
        primary: "#0071E3",
        "primary-bg": "rgba(0,113,227,0.06)",
        "text-primary": "#1D1D1F",
        "text-secondary": "#6E6E73",
        "text-tertiary": "#AEAEB2",
        border: "#E5E5EA",
        success: "#34C759",
        "success-bg": "rgba(52,199,89,0.08)",
        warning: "#FF9500",
        "warning-bg": "rgba(255,149,0,0.08)",
        danger: "#FF3B30",
        "danger-bg": "rgba(255,59,48,0.06)",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      letterSpacing: { tight2: "-0.03em" },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
        cardmd: "0 4px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
        cardlg: "0 12px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)",
      },
      animation: { spin: "spin 0.8s linear infinite" },
    },
  },
  plugins: [],
};
export default config;
