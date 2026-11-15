import React from 'react';
import type { Metadata, Viewport } from 'next';
import '../styles/index.css';
import { AuthProvider } from '@/contexts/AuthContext';
import PendingStatusBanner from '@/modules/common/PendingStatusBanner';
import NotificationHost from '@/components/ui/NotificationHost';
import MobileTabBar from '@/components/ui/MobileTabBar';
import LoginModal from '@/components/auth/LoginModal';
import GlobalVoiceInput from '@/components/voice/GlobalVoiceInput';
import SystemChromeSync from '@/components/ui/SystemChromeSync';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f6fa' },
    { media: '(prefers-color-scheme: dark)', color: '#080b12' },
  ],
};

export const metadata: Metadata = {
  title: 'LabNinja',
  description:
    'Modern preparation AI lms labs for DSA, computer vision, and system design and much more',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', type: 'image/x-icon' },
    ],
    apple: [{ url: '/apple-touch-icon.png', type: 'image/png' }],
  },
  // iPhone: "Add to Home Screen" opens it full-screen like an app — the only way iOS lets a web app notify.
  appleWebApp: {
    capable: true,
    title: 'LabNinja',
    statusBarStyle: 'default',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('interview-ninja-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute('content',d?'#080b12':'#f5f6fa')})}catch(e){document.documentElement.classList.add('dark')}
try{var a=JSON.parse(localStorage.getItem('labninja.appearance.v1')||'null');var hex=a&&a.accentHex;if(hex&&/^#[0-9a-fA-F]{6}$/.test(hex)){var root=document.documentElement,isDark=root.classList.contains('dark');var b=[1,3,5].map(function(i){return parseInt(hex.slice(i,i+2),16)});var mix=function(c,t,k){return [c[0]+(t[0]-c[0])*k,c[1]+(t[1]-c[1])*k,c[2]+(t[2]-c[2])*k]};var ch=function(v){v=v/255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};var lum=function(c){return 0.2126*ch(c[0])+0.7152*ch(c[1])+0.0722*ch(c[2])};var cr=function(x,y){var p=lum(x),q=lum(y);return (Math.max(p,q)+0.05)/(Math.min(p,q)+0.05)};var sf=isDark?[32,41,56]:[245,246,250],tw=isDark?[255,255,255]:[0,0,0],k=isDark?0:0.12,p=mix(b,tw,k);while(k<0.7&&cr(p,sf)<4.5){k+=0.04;p=mix(b,tw,k)}var ring=mix(p,[255,255,255],isDark?0.14:0.08);var fg=cr(p,[255,255,255])>=cr(p,[11,16,32])?'#ffffff':'#0b1020';var hx=function(c){return '#'+c.map(function(v){return Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')}).join('')};root.style.setProperty('--color-primary',hx(p));root.style.setProperty('--color-primary-foreground',fg);root.style.setProperty('--color-ring',hx(ring));root.style.setProperty('--color-glow','rgba('+Math.round(p[0])+','+Math.round(p[1])+','+Math.round(p[2])+','+(isDark?0.22:0.16)+')')}}catch(e){}
try{var sm=localStorage.getItem('labninja.sidebar_mode.v1');if(sm!=='hidden'){document.documentElement.classList.add('has-sidebar-rail')}}catch(e){}
(function(){function heal(){try{var k='labninja.chunk-reload',n=Date.now();if(n-(+sessionStorage.getItem(k)||0)<20000)return;sessionStorage.setItem(k,String(n));location.reload()}catch(e){}}window.addEventListener('error',function(e){var t=e.target;if(t&&t.tagName==='SCRIPT'&&t.src&&t.src.indexOf('/_next/static/')>-1){heal();return}if(e.filename&&e.filename.indexOf('/_next/static/')>-1&&((e.error&&e.error.name==='SyntaxError')||/SyntaxError/.test(e.message||'')))heal()},true)})();`,
          }}
        />
        <AuthProvider>
          <PendingStatusBanner />
          {children}
          <NotificationHost />
          <MobileTabBar />
          <LoginModal />
          <GlobalVoiceInput />
          <SystemChromeSync />
        </AuthProvider>

        <script
          type="module"
          async
          src="https://static.rocket.new/rocket-web.js?_cfg=https%3A%2F%2Finterviewn6914back.builtwithrocket.new&_be=https%3A%2F%2Fappanalytics.rocket.new&_v=0.1.19"
        />
        <script type="module" defer src="https://static.rocket.new/rocket-shot.js?v=0.0.2" />
      </body>
    </html>
  );
}
