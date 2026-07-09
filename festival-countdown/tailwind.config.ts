import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        surface: 'hsl(var(--surface))',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        foreground: 'hsl(var(--primary-text))',
        'primary-text': 'hsl(var(--primary-text))',
        'secondary-text': 'hsl(var(--secondary-text))',
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          secondary: 'hsl(var(--accent-secondary))'
        },
        // Add success/error per PRD...
        success: 'hsl(var(--success))',
        error: 'hsl(var(--error))',

        // PRD: Update primary and add hover
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          hover: 'hsl(var(--primary-hover))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        }
      },
      fontFamily: {
        sans: ['var(--font-primary)', 'Inter', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'var(--radius)',
        sm: 'var(--radius)'
      },
      fontSize: {
        heading: ['2rem', { lineHeight: '2.5rem', fontWeight: '400' }],
        stat: ['4.5rem', { lineHeight: '1', fontWeight: '500' }],
        subheading: ['1rem', { lineHeight: '1.5rem', fontWeight: '400' }],
        cardTitle: ['1rem', { lineHeight: '1.5rem', fontWeight: '500', textTransform: 'uppercase' }],
        body: ['1rem', { lineHeight: '1.5rem', fontWeight: '400' }]
      },
      boxShadow: {
        DEFAULT: 'none',
        sm: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
        '2xl': 'none',
        inner: 'none'
      }
    }
  },
  plugins: [
    require("tailwindcss-animate")
  ],
} satisfies Config;