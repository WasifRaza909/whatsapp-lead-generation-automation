/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  corePlugins: {
    container: false
  },
  theme: {
    extend: {
      colors: {
        app: {
          bg: '#030912',
          surface: 'rgba(9, 18, 33, 0.72)',
          border: 'rgba(51, 65, 85, 0.55)',
          text: '#e2e8f0',
          'text-dim': '#475569',
          'text-mute': '#1e293b'
        },
        cyan: {
          DEFAULT: '#22d3ee',
          light: '#67e8f9'
        },
        purple: {
          DEFAULT: '#a78bfa',
          light: '#c4b5fd',
          lighter: '#ddd6fe',
          lightest: '#ede9fe'
        },
        green: {
          DEFAULT: '#34d399'
        },
        red: {
          DEFAULT: '#f87171',
          dark: '#dc2626',
          light: '#fca5a5'
        }
      },
      fontFamily: {
        sans: ["'Inter Variable'", "'Inter'", 'system-ui', '-apple-system', 'sans-serif'],
        mono: ["'JetBrains Mono'", "'Cascadia Code'", "'Fira Code'", "'Consolas'", 'monospace']
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
        'in-out-smooth': 'cubic-bezier(0.45, 0, 0.15, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
      },
      keyframes: {
        breathe: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.35', transform: 'scale(0.75)' }
        },
        gradShift: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' }
        },
        staggerIn: {
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        fadeSoft: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        shimmerSlide: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(33.33%)' }
        },
        cardGlow: {
          '0%, 100%': {
            boxShadow: '0 0 30px rgba(34,211,238,0.06), inset 0 0 50px rgba(34,211,238,0.015)'
          },
          '50%': {
            boxShadow: '0 0 60px rgba(34,211,238,0.14), inset 0 0 80px rgba(34,211,238,0.04)'
          }
        },
        dangerPulse: {
          '0%, 100%': { boxShadow: '0 4px 18px rgba(248,113,113,0.25)' },
          '50%': { boxShadow: '0 4px 36px rgba(248,113,113,0.55)' }
        },
        floatBlob1: {
          '0%': { transform: 'translate(0, 0) scale(1)', opacity: '0.5' },
          '33%': { transform: 'translate(80px, 60px) scale(1.15)', opacity: '0.8' },
          '66%': { transform: 'translate(-40px, 120px) scale(0.9)', opacity: '0.6' },
          '100%': { transform: 'translate(50px, -30px) scale(1.05)', opacity: '0.7' }
        },
        floatBlob2: {
          '0%': { transform: 'translate(0, 0) scale(1)', opacity: '0.45' },
          '33%': { transform: 'translate(-60px, -80px) scale(1.1)', opacity: '0.75' },
          '66%': { transform: 'translate(40px, -40px) scale(0.95)', opacity: '0.5' },
          '100%': { transform: 'translate(-50px, 60px) scale(1.08)', opacity: '0.65' }
        },
        loaderSheen: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(200%)' }
        },
        radarRing: {
          '0%': { transform: 'scale(0.15)', opacity: '0.9' },
          '70%': { opacity: '0.15' },
          '100%': { transform: 'scale(1.85)', opacity: '0' }
        },
        coreBeat: {
          '0%, 100%': {
            transform: 'translate(-50%,-50%) scale(1)',
            boxShadow: '0 0 14px #22d3ee'
          },
          '50%': {
            transform: 'translate(-50%,-50%) scale(1.25)',
            boxShadow: '0 0 22px #22d3ee, 0 0 44px rgba(34,211,238,0.5)'
          }
        },
        scanBar: {
          '0%': { transform: 'translateX(-160%)', opacity: '0.35' },
          '15%': { opacity: '1' },
          '85%': { opacity: '1' },
          '100%': { transform: 'translateX(430%)', opacity: '0.35' }
        },
        rowEntrance: {
          '0%': {
            opacity: '0',
            transform: 'translateX(-12px)',
            background: 'rgba(34,211,238,0.16)'
          },
          '40%': { background: 'rgba(34,211,238,0.08)' },
          '100%': { opacity: '1', transform: 'translateX(0)', background: 'transparent' }
        },
        dotBounce: {
          '0%, 80%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '40%': { transform: 'translateY(-4px)', opacity: '1' }
        },
        spin: {
          to: { transform: 'rotate(360deg)' }
        },
        modalPop: {
          from: { opacity: '0', transform: 'scale(0.92) translateY(20px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' }
        }
      },
      animation: {
        breathe: 'breathe 2.8s cubic-bezier(0.45, 0, 0.15, 1) infinite',
        'grad-shift': 'gradShift 12s cubic-bezier(0.45, 0, 0.15, 1) infinite',
        'stagger-1': 'staggerIn 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.08s forwards',
        'stagger-2': 'staggerIn 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.18s forwards',
        'stagger-3': 'staggerIn 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.30s forwards',
        'stagger-4': 'staggerIn 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.44s forwards',
        'shimmer-slide': 'shimmerSlide 8s linear infinite',
        'card-glow': 'cardGlow 5s cubic-bezier(0.45, 0, 0.15, 1) infinite',
        'danger-pulse': 'dangerPulse 3s cubic-bezier(0.45, 0, 0.15, 1) infinite',
        'float-blob-1': 'floatBlob1 22s cubic-bezier(0.45, 0, 0.15, 1) infinite alternate',
        'float-blob-2': 'floatBlob2 26s cubic-bezier(0.45, 0, 0.15, 1) infinite alternate',
        'fade-soft': 'fadeSoft 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-up': 'fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both',
        'loader-sheen': 'loaderSheen 3s linear infinite',
        'radar-ring': 'radarRing 2.6s cubic-bezier(0.25, 1, 0.5, 1) infinite',
        'radar-ring-2': 'radarRing 2.6s cubic-bezier(0.25, 1, 0.5, 1) 0.87s infinite',
        'radar-ring-3': 'radarRing 2.6s cubic-bezier(0.25, 1, 0.5, 1) 1.74s infinite',
        'core-beat': 'coreBeat 1.9s cubic-bezier(0.45, 0, 0.15, 1) infinite',
        'scan-bar': 'scanBar 2.8s cubic-bezier(0.45, 0, 0.15, 1) infinite',
        'row-entrance': 'rowEntrance 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
        'dot-bounce': 'dotBounce 1.4s cubic-bezier(0.45, 0, 0.15, 1) infinite',
        'dot-bounce-2': 'dotBounce 1.4s cubic-bezier(0.45, 0, 0.15, 1) 0.2s infinite',
        'dot-bounce-3': 'dotBounce 1.4s cubic-bezier(0.45, 0, 0.15, 1) 0.4s infinite',
        'modal-pop': 'modalPop 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
        'breathe-fast': 'breathe 1.6s cubic-bezier(0.45, 0, 0.15, 1) infinite',
        spin: 'spin 0.7s linear infinite'
      }
    }
  },
  plugins: []
}
