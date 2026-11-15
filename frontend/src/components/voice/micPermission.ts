import { Capacitor } from '@capacitor/core';

/**
 * Microphone error texts shared by the voice hooks. Inside the Android app (Capacitor WebView) there is no browser
 * site-settings page to send people to: the switch is the app's own Microphone permission in Android Settings.
 */

function inNativeApp(): boolean {
  try {
    return typeof window !== 'undefined' && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function micBlockedMessage(): string {
  return inNativeApp()
    ? 'Microphone is off for LabNinja. Turn it on in Android Settings → Apps → LabNinja → Permissions → Microphone.'
    : 'Microphone is blocked. Allow it in your browser’s site settings.';
}

/** Text for a failed microphone start (getUserMedia / SpeechRecognition.start()), by the DOMException name. */
export function micStartErrorMessage(err: unknown): string {
  const name = (err as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return micBlockedMessage();
  }
  if (name === 'NotFoundError') return 'No microphone found.';
  if (name === 'NotReadableError')
    return 'The microphone is busy in another app. Close it and try again.';
  return 'Couldn’t start the microphone. Try again.';
}
