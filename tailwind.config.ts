import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        matrix: {
          bg: '#061426',
          panel: '#0B1E35',
          'panel-hover': '#132742',
          blue: '#245BFF',
          text: '#F5F7FA',
          muted: '#A8B6CB',
          border: '#243B55',
          critical: '#EF4444',
          elevated: '#FBBF24',
          safe: '#10B981',
          pending: '#94A3B8',
        },
      },
      fontFamily: {
        mono: ['var(--font-space-mono)', 'Space Mono', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
