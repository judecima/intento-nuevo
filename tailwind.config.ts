import type { Config } from "tailwindcss";
import withMT from "@material-tailwind/react/utils/withMT";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["IBM Plex Sans", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
        display: ["Bricolage Grotesque", "system-ui", "sans-serif"]
      },
      colors: {
        ink: "#121717",
        graphite: "#171d1e",
        paper: "#ffffff",
        mist: "#eceeea",
        line: "#d5dad4",
        amber: "#f5b301",
        teal: "#12666b",
        coral: "#c0432c"
      },
      boxShadow: {
        panel: "0 1px 2px rgba(18, 23, 23, 0.06)",
        raised: "0 2px 6px rgba(18, 23, 23, 0.07), 0 12px 28px -18px rgba(18, 23, 23, 0.35)",
        float: "0 18px 48px -24px rgba(18, 23, 23, 0.5)"
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "none" }
        }
      },
      animation: {
        "fade-in": "fade-in 180ms ease-out"
      }
    }
  },
  plugins: []
};

export default withMT(config);
