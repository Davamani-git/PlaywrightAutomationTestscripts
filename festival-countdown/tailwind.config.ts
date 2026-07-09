import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Logical tokens mapped to CSS variables, keeping existing design tokens intact
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        surface: 'hsl(var(--surface))',
        card: 'hsl(var(--card))',
        'primary-text': 'hsl(var(--primary-text))',
        'secondary-text': 'hsl(var(--secondary-text))',
        accent: 'hsl(var(--accent))',
        'accent-secondary': 'hsl(var(--accent-secondary))',
        primary: 'hsl(var(--primary))',
        'primary-hover': 'hsl(var(--primary-hover))',
        'primary-foreground': 'hsl(var(--primary-foreground))',
        success: 'hsl(var(--success))',
        error: 'hsl(var(--error))',
        border: 'hsl(var(--border))',
        muted: 'hsl(var(--muted))',
        'muted-foreground': 'hsl(var(--muted-foreground))',
        destructive: 'hsl(var(--destructive))',
        'destructive-foreground': 'hsl(var(--destructive-foreground))',
        popover: 'hsl(var(--popover))',
        'popover-foreground': 'hsl(var(--popover-foreground))',
        cardForeground: 'hsl(var(--card-foreground))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        // Named brand teal for direct usage when needed
        brandTeal: '#2b7a78',
      },
    },
  },
  plugins: [],
};

export default config;
