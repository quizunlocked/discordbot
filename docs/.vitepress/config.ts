import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Quiz Unlocked",
  description: "Free Open Source Discord Quiz Bot - Host engaging real-time trivia games with leaderboards, stats, and custom quiz uploads",
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#0099ff' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:locale', content: 'en' }],
    ['meta', { property: 'og:title', content: 'Quiz Unlocked | Discord Quiz Bot Documentation' }],
    ['meta', { property: 'og:description', content: 'Comprehensive documentation for Quiz Unlocked, the free open-source Discord quiz bot.' }],
    ['meta', { property: 'og:site_name', content: 'Quiz Unlocked Documentation' }],
  ],
  
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: { src: '/logo.svg', width: 24, height: 24 },
    
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/getting-started' },
      { text: 'Commands', link: '/commands' },
      { text: 'Development', link: '/development' },
      { 
        text: 'Links',
        items: [
          { text: 'GitHub Repository', link: 'https://github.com/anthonyronda/learn-polish-bot' },
          { text: 'Issues & Support', link: 'https://github.com/anthonyronda/learn-polish-bot/issues' },
          { text: 'Discussions', link: 'https://github.com/anthonyronda/learn-polish-bot/discussions' }
        ]
      }
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Overview', link: '/overview' },
          { text: 'Getting Started', link: '/getting-started' }
        ]
      },
      {
        text: 'User Guide',
        items: [
          { text: 'Command Reference', link: '/commands' },
          { text: 'FAQ', link: '/faq' }
        ]
      },
      {
        text: 'Technical Documentation',
        items: [
          { text: 'Architecture', link: '/architecture' },
          { text: 'Development Guide', link: '/development' },
          { text: 'Deployment Guide', link: '/deployment' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/anthonyronda/learn-polish-bot' }
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present Quiz Unlocked Contributors'
    },

    editLink: {
      pattern: 'https://github.com/anthonyronda/learn-polish-bot/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },

    search: {
      provider: 'local'
    },

    outline: {
      level: [2, 3]
    }
  },

  markdown: {
    container: {
      tipLabel: '💡 Tip',
      warningLabel: '⚠️ Warning',
      dangerLabel: '❌ Danger',
      infoLabel: 'ℹ️ Info',
      detailsLabel: 'Details'
    }
  }
})
