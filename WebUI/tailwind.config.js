/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 主色调 - 使用 CSS 变量支持主题切换
        primary: {
          DEFAULT: 'var(--color-primary)',
          dark: 'var(--color-primary-dark)',
          light: 'var(--color-primary-light)',
          glow: 'var(--color-primary-glow)',
        },
        // 强调色
        accent: {
          blue: 'var(--color-accent-blue)',
          purple: 'var(--color-accent-purple)',
          orange: 'var(--color-accent-orange)',
          pink: 'var(--color-accent-pink)',
        },
        // 背景色
        bg: {
          darkest: 'var(--color-bg-darkest)',
          dark: 'var(--color-bg-dark)',
          medium: 'var(--color-bg-medium)',
          light: 'var(--color-bg-light)',
          lighter: 'var(--color-bg-lighter)',
          hover: 'var(--color-bg-hover)',
          glass: 'var(--color-glass)',
        },
        // 文字颜色
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
        },
        // 边框
        border: {
          DEFAULT: 'var(--color-border)',
          light: 'var(--color-border-light)',
          subtle: 'var(--color-border-subtle)',
          active: 'var(--color-border-active)',
          glass: 'var(--color-glass-border)',
        },
        // 日志级别 (从高到低: error > warning > info > debug > verbose)
        level: {
          error: '#ef4444',
          warning: '#f59e0b',
          info: '#4facfe',
          debug: '#8b949e',
          verbose: '#6b7280',
        },
        // HTTP 方法
        method: {
          get: '#22c55e',
          post: '#3b82f6',
          put: '#f59e0b',
          delete: '#ef4444',
          patch: '#a855f7',
        },
        // 状态码颜色
        status: {
          success: '#22c55e',
          redirect: '#3b82f6',
          client: '#f59e0b',
          server: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Monaco', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.75rem' }],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        'glow': 'var(--shadow-glow)',
        'glow-lg': '0 0 40px var(--color-primary-glow)',
      },
      backdropBlur: {
        'xs': '2px',
      },
      animation: {
        'fadeIn': 'fadeIn 0.3s ease-out',
        'slideInRight': 'slideInRight 0.3s ease-out',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },
      transitionTimingFunction: {
        'bounce-in': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      },
    },
  },
  plugins: [],
}
