import React from 'react';
import type { Metadata, Viewport } from 'next';
import '../styles/index.css';
import { AuthProvider } from '@/contexts/AuthContext';
import PendingStatusBanner from '@/modules/common/PendingStatusBanner';
import NotificationHost from '@/components/ui/NotificationHost';
import MobileTabBar from '@/components/ui/MobileTabBar';
import LoginModal from '@/components/auth/LoginModal';
import GlobalVoiceInput from '@/components/voice/GlobalVoiceInput';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
            __html: `try{var t=localStorage.getItem('interview-ninja-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){document.documentElement.classList.add('dark')}
try{var a=JSON.parse(localStorage.getItem('labninja.appearance.v1')||'null');var hex=a&&a.accentHex;if(hex&&/^#[0-9a-fA-F]{6}$/.test(hex)){var root=document.documentElement;var isDark=root.classList.contains('dark');var r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);if(!isDark){r=r*0.88;g=g*0.88;b=b*0.88;}var ring=[r+(255-r)*(isDark?0.14:0.08),g+(255-g)*(isDark?0.14:0.08),b+(255-b)*(isDark?0.14:0.08)];var lum=(0.2126*r+0.7152*g+0.0722*b)/255;var toHex=function(v){return Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0');};root.style.setProperty('--color-primary','#'+toHex(r)+toHex(g)+toHex(b));root.style.setProperty('--color-primary-foreground',lum>0.55?'#17131f':'#ffffff');root.style.setProperty('--color-ring','#'+toHex(ring[0])+toHex(ring[1])+toHex(ring[2]));root.style.setProperty('--color-glow','rgba('+Math.round(r)+','+Math.round(g)+','+Math.round(b)+','+(isDark?0.22:0.16)+')');}}catch(e){}
try{var sm=localStorage.getItem('labninja.sidebar_mode.v1');if(sm!=='hidden'){document.documentElement.classList.add('has-sidebar-rail')}}catch(e){}`,
          }}
        />
        <AuthProvider>
          <PendingStatusBanner />
          {children}
          <NotificationHost />
          <MobileTabBar />
          <LoginModal />
          <GlobalVoiceInput />
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
