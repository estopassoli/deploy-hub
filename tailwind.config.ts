import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
import containerQueries from "@tailwindcss/container-queries";

const alpha = (v: string) => `hsl(var(${v}) / <alpha-value>)`;
const tint = (v: string, a: number) => `hsl(var(${v}) / ${a})`;

export default {
  // Tema escuro único: sem darkMode, sem classe .dark, sem variantes dark:.
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },

      // Os nomes numéricos foram retunados para os valores do kit (havia 161 usos de
      // text-xs e 204 de text-sm), e os nomes semânticos são o alvo do refactor —
      // prefira sempre estes.
      fontSize: {
        "2xs": ["11px", { lineHeight: "16px" }],
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["13px", { lineHeight: "20px" }],
        base: ["15px", { lineHeight: "22px" }],
        lg: ["16px", { lineHeight: "24px" }],
        xl: ["20px", { lineHeight: "28px", letterSpacing: "-0.02em" }],
        "2xl": ["24px", { lineHeight: "28px", letterSpacing: "-0.02em" }],
        "3xl": ["28px", { lineHeight: "34px", letterSpacing: "-0.03em" }],

        overline: ["11px", { lineHeight: "16px", letterSpacing: "0.06em", fontWeight: "500" }],
        meta: ["12px", { lineHeight: "16px" }],
        mono: ["12px", { lineHeight: "18px" }], // tabelas
        "mono-log": ["12.5px", { lineHeight: "20px" }], // logs e terminal
        body: ["13px", { lineHeight: "20px" }],
        section: ["14px", { lineHeight: "20px", letterSpacing: "-0.005em", fontWeight: "600" }],
        "body-lg": ["15px", { lineHeight: "22px" }], // body no mobile
        title: ["20px", { lineHeight: "28px", letterSpacing: "-0.02em", fontWeight: "600" }],
        "num-sm": ["24px", { lineHeight: "28px", letterSpacing: "-0.02em", fontWeight: "600" }],
        num: ["28px", { lineHeight: "32px", letterSpacing: "-0.02em", fontWeight: "600" }],
        hero: ["28px", { lineHeight: "34px", letterSpacing: "-0.03em", fontWeight: "600" }],
      },

      // ATENÇÃO — estes nomes são os que todo snippet do guia escreve. Não renomeie:
      // bg-bg-1, text-text-2, border-line-2, bg-accent, bg-accent-strong, text-red,
      // bg-red-solid, text-amber, text-blue, text-violet. As tintas saem do modificador
      // de opacidade nativo (bg-accent/12, border-red/30), por isso não existe token
      // "tint" separado.
      colors: {
        // rampa crua — o vocabulário do redesign
        bg: { 0: alpha("--bg-0"), 1: alpha("--bg-1"), 2: alpha("--bg-2"), 3: alpha("--bg-3") },
        line: { 1: alpha("--line-1"), 2: alpha("--line-2"), 3: alpha("--line-3") },
        text: { 1: alpha("--text-1"), 2: alpha("--text-2"), 3: alpha("--text-3") },

        // O emerald do kit ocupa a chave `accent` DE PROPÓSITO: é isso que faz
        // bg-accent / text-accent / ring-accent valerem #3DD68C. A superfície neutra de
        // hover do shadcn (a var CSS --accent, que é bg-2) deixa de ter classe própria:
        // escreva bg-bg-2.
        accent: {
          DEFAULT: alpha("--brand"), // #3DD68C
          strong: alpha("--brand-strong"), // #30A46C — fills sólidos
          foreground: alpha("--brand-foreground"),
        },

        // semântica de status, nos nomes que os snippets usam
        red: {
          DEFAULT: alpha("--errored"),
          solid: alpha("--destructive-solid"),
          "solid-foreground": alpha("--destructive-solid-foreground"),
        },
        amber: alpha("--building"),
        blue: alpha("--info"),
        violet: alpha("--docker"),

        // mesmos valores sob os nomes de estado, para quem preferir ler text-errored a
        // text-red. São aliases, não uma segunda paleta.
        running: alpha("--running"),
        stopped: alpha("--stopped"),
        errored: alpha("--errored"),
        building: alpha("--building"),
        warning: { DEFAULT: alpha("--warning"), foreground: alpha("--warning-foreground") },
        info: alpha("--info"),
        docker: alpha("--docker"),

        // aliases shadcn — não remover, os primitives dependem deles
        border: alpha("--border"),
        input: alpha("--input"),
        ring: alpha("--ring"),
        background: alpha("--background"),
        foreground: alpha("--foreground"),
        primary: { DEFAULT: alpha("--primary"), foreground: alpha("--primary-foreground") },
        secondary: { DEFAULT: alpha("--secondary"), foreground: alpha("--secondary-foreground") },
        destructive: {
          DEFAULT: alpha("--destructive"),
          foreground: alpha("--destructive-foreground"),
          solid: alpha("--destructive-solid"),
          "solid-foreground": alpha("--destructive-solid-foreground"),
          tint: tint("--destructive", 0.12),
          border: tint("--destructive", 0.3),
        },
        success: { DEFAULT: alpha("--success"), foreground: alpha("--success-foreground") },
        muted: { DEFAULT: alpha("--muted"), foreground: alpha("--muted-foreground") },
        popover: { DEFAULT: alpha("--popover"), foreground: alpha("--popover-foreground") },
        card: { DEFAULT: alpha("--card"), foreground: alpha("--card-foreground") },
        sidebar: {
          DEFAULT: alpha("--sidebar-background"),
          foreground: alpha("--sidebar-foreground"),
          primary: alpha("--sidebar-primary"),
          "primary-foreground": alpha("--sidebar-primary-foreground"),
          accent: alpha("--sidebar-accent"),
          "accent-foreground": alpha("--sidebar-accent-foreground"),
          border: alpha("--sidebar-border"),
          ring: alpha("--sidebar-ring"),
        },
      },

      // 4 / 6 / 8 / 12 / full. Concêntrico: interno = externo − padding, mínimo 4.
      borderRadius: {
        none: "0",
        sm: "4px", // kbd, tag mono, level tag, checkbox
        DEFAULT: "var(--radius)", // 6px
        md: "var(--radius)", // 6px — botão, input, select, item de menu, segmented
        lg: "8px", // card, tabela, menu, popover, painel de log
        xl: "12px", // dialog, sheet, command palette
        "2xl": "16px", // só o topo do bottom sheet no mobile
        full: "9999px", // dot, pill de status, switch, avatar
      },

      spacing: {
        13: "3.25rem", // 52px — top bar do desktop, header da sidebar
        17: "4.25rem", // 68px — faixa de saúde do servidor
        180: "45rem", // 720px — coluna de formulário
      },

      boxShadow: {
        // única sombra do produto; usar SÓ em overlay
        overlay: "0 16px 48px rgb(0 0 0 / 0.55), 0 0 0 1px hsl(var(--line-2))",
        none: "none",
      },

      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },

      transitionDuration: { DEFAULT: "140ms" },
      transitionTimingFunction: { DEFAULT: "cubic-bezier(0.2, 0, 0, 1)" },
    },
  },
  plugins: [animate, containerQueries],
} satisfies Config;
