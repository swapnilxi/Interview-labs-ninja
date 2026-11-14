import type { MetadataRoute } from 'next';

/**
 * Web app manifest (served at /manifest.webmanifest). It makes the app installable — "Add to Home Screen" on iPhone,
 * "Install app" on Android/desktop — which iPhones require before a web app may show notifications at all.
 * It opens on the To-Do's Today screen, where voice capture and reminders live. See public/notification-setup.html.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LabNinja',
    short_name: 'LabNinja',
    description: 'Say a task, get reminded. AI To-Do, labs and learning in one place.',
    id: '/ai-todo',
    start_url: '/ai-todo?tab=today',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b0b10',
    theme_color: '#2563eb',
    categories: ['productivity', 'education'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Add a task by voice',
        short_name: 'Speak a task',
        url: '/ai-todo?tab=today&capture=voice',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  };
}
