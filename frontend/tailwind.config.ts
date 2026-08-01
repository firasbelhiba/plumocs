import type { Config } from 'tailwindcss';

/**
 * Ported from the plumo project-management console so both pillars share one
 * component language. The only intentional divergence is the brand anchor:
 * --primary resolves to plumo support green (#4C9F6E) rather than plumo blue.
 */
const config: Config = {
  content: ['./components/**/*.{js,jsx,ts,tsx}', './app/**/*.{js,jsx,ts,tsx}'],
  darkMode: ['class', '[data-cs-theme="dark"]'],
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
        primary: { DEFAULT: 'var(--primary)' },
        'primary-soft': 'var(--primary-soft)',
        'primary-hover': 'var(--primary-hover)',
        'success-soft': 'var(--success-soft)',
        'warning-soft': 'var(--warning-soft)',
        'danger-soft': 'var(--danger-soft)',
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
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
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
