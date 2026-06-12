import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f4ff",
          500: "#5865f2",
          600: "#4752c4",
          900: "#1e2065",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
