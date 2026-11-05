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
        alma: {
          kiwi: "#aadf49",
          collard: "#3c5627",
          aioli: "#f7f5ed",
          teriyaki: "#33140c",
          yogurt: "#fffdf5",
          surface: "#fffefc",
          muted: "#a1a1a1",
          teal: "#146c84",
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', "Georgia", "serif"],
        sans: ["var(--font-geist-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      borderRadius: {
        alma: "20px",
        pill: "50px",
      },
      maxWidth: {
        content: "1200px",
        narrow: "720px",
      },
      spacing: {
        section: "80px",
        "section-mobile": "40px",
      },
      keyframes: {
        "marquee-ltr": {
          "0%": { transform: "translateX(-50%)" },
          "100%": { transform: "translateX(0%)" },
        },
        "marquee-rtl": {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        "float-delayed": "float-delayed 7s ease-in-out infinite",
        "float-slow": "float 9s ease-in-out infinite",
        "marquee-ltr": "marquee-ltr 35s linear infinite",
        "marquee-rtl": "marquee-rtl 35s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
