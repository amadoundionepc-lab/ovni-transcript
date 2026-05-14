/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg:      "#08080f",
        surface: "#0f0f1a",
        card:    "#13131f",
        border:  "#1e1e30",
        accent:  "#7c3aed",
        "accent-light": "#a78bfa",
        muted:   "#5a5a7a",
        text:    "#e8e8f0",
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};
