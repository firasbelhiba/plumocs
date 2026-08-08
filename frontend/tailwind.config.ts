import type { Config } from 'tailwindcss';

/**
 * Ported from the plumo project-management console so both pillars share one
 * component language. The only intentional divergence is the brand anchor:
 * --primary resolves to plumo support green (#4C9F6E) rather than plumo blue.
 */
const config: Config = {
  content: [
    './components/**/*.{js,jsx,ts,tsx}',
    './app/**/*.{js,jsx,ts,tsx}',
    './lib/**/*.{js,jsx,ts,tsx}',
    './hooks/**/*.{js,jsx,ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        'border-strong': 'var(--border-strong)',
        fg: 'var(--text)',
        'fg-2': 'var(--text-2)',
        'fg-3': 'var(--text-3)',
        'primary-soft': 'var(--primary-soft)',
        'primary-hover': 'var(--primary-hover)',
        'success-soft': 'var(--success-soft)',
        'warning-soft': 'var(--warning-soft)',
        'danger-soft': 'var(--danger-soft)',

        // Numbered scales, mirroring PM's. Kept for backwards compat and so
        // that files ported from PM (which emit `bg-primary-50`,
        // `bg-success-400`, …) resolve instead of rendering unstyled.
        // Every ramp except `primary` is copied from PM verbatim. `primary` is
        // re-tinted to the CS brand anchor: PM's lightness ladder held constant,
        // hue/saturation taken from --brand-h/--brand-s (145 / 35%), the same
        // derivation --primary-hover and --ring already use.
        primary: {
          DEFAULT: 'var(--primary)',
          50: '#EBF5EF', // hsl(145 35% 94%)
          100: '#CFE8D9', // hsl(145 35% 86%)
          200: '#B0D9C1', // hsl(145 35% 77%)
          300: '#90CAA8', // hsl(145 35% 68%)
          400: '#79BE96', // hsl(145 35% 61%)
          500: '#428A60', // hsl(145 35% 40%)
          600: '#3A7954', // hsl(145 35% 35%)
          700: '#326748', // hsl(145 35% 30%)
          800: '#2A563C', // hsl(145 35% 25%)
          900: '#214530', // hsl(145 35% 20%)
          dark: '#3A7954',
        },
        secondary: {
          50: '#F4F5F7',
          100: '#EBECF0',
          200: '#DFE1E6',
          300: '#C1C7D0',
          400: '#A5ADBA',
          500: '#172B4D',
          600: '#132440',
          700: '#0F1D33',
          800: '#0B1626',
          900: '#070F1A',
        },
        success: {
          50: '#E8F5E9',
          100: '#C8E6C9',
          200: '#A5D6A7',
          300: '#81C784',
          400: '#66BB6A',
          500: '#00875A',
          600: '#007850',
          700: '#006945',
          800: '#005A3B',
          900: '#004B31',
        },
        warning: {
          50: '#FFF3E0',
          100: '#FFE0B2',
          200: '#FFCC80',
          300: '#FFB74D',
          400: '#FFA726',
          500: '#FF991F',
          600: '#E68A1B',
          700: '#CC7A18',
          800: '#B36B15',
          900: '#995C12',
        },
        danger: {
          50: '#FFEBEE',
          100: '#FFCDD2',
          200: '#EF9A9A',
          300: '#E57373',
          400: '#EF5350',
          500: '#DE350B',
          600: '#C72E0A',
          700: '#B02708',
          800: '#992007',
          900: '#821A06',
        },
        dark: {
          50: '#F4F5F7',
          100: '#EBECF0',
          200: '#38414A',
          300: '#282E33',
          400: '#22272B',
          500: '#1D2125',
          600: '#191C1F',
          700: '#14171A',
          800: '#101214',
          900: '#0C0D0F',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        token: 'var(--radius)',
        'token-sm': 'calc(var(--radius) * 0.5)',
        'token-lg': 'calc(var(--radius) * 1.5)',
      },
      zIndex: {
        dropdown: '10',
        sticky: '20',
        fixed: '30',
        'modal-backdrop': '40',
        modal: '50',
        popover: '60',
        tooltip: '70',
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        '3xs': ['0.5625rem', { lineHeight: '0.75rem' }],
        badge: ['0.5625rem', { lineHeight: '0.75rem' }],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        modal: 'var(--shadow-modal)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'spin-slow': 'spin 1.5s linear infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideIn: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
