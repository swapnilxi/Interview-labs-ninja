'use client';

import React, { useEffect, useState, type ReactNode } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  APK_URL,
  detectInstallEnv,
  fetchApkMeta,
  formatMegabytes,
  useInstallPrompt,
  type ApkMeta,
  type InstallEnv,
} from '@/lib/pwa/installApp';
import { CODE, GroupHeading, Notice, SectionHeader } from './parts';
import './install.css';

/** True when NEXT_PUBLIC_ANDROID_APK_URL points somewhere else, so a missing metadata file is not "unpublished". */
const APK_HOSTED_ELSEWHERE = APK_URL !== '/downloads/labninja.apk';

/**
 * Install app: the Android app (an APK the site hosts) and the web app (the browser's own install). The page reads
 * the device first, so each visitor sees what works on what they hold: Android puts the APK first, a computer puts
 * the web app first, an iPhone only gets the web app, and inside the Android app there is nothing left to install.
 */
export default function InstallSection() {
  const [env, setEnv] = useState<InstallEnv | null>(null);
  const [apk, setApk] = useState<ApkMeta | null | 'loading'>('loading');

  useEffect(() => {
    setEnv(detectInstallEnv());
    let live = true;
    void fetchApkMeta().then((meta) => {
      if (live) setApk(meta);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div>
      <SectionHeader
        title="Install app"
        sub="Put LabNinja on your home screen or dock, so it opens in its own window like any other app."
      />
      {env === null ? null : env.native ? (
        <InsideAndroidApp />
      ) : (
        <div className="space-y-[1.75rem]">
          {env.platform === 'android' && <AndroidApp env={env} apk={apk} />}
          <WebApp env={env} />
          {env.platform === 'desktop' && <AndroidApp env={env} apk={apk} />}
        </div>
      )}
    </div>
  );
}

function AppIconImage() {
  // eslint-disable-next-line @next/next/no-img-element -- a fixed 56px icon from /public, nothing to optimise.
  return <img src="/icons/icon-192.png" alt="" width={56} height={56} className="cfg-app-icon" />;
}

function InsideAndroidApp() {
  return (
    <div className="space-y-3">
      <div className="cfg-readout">
        <div className="flex items-center gap-[0.875rem]">
          <AppIconImage />
          <div className="min-w-0">
            <p className="cfg-app-name font-heading">LabNinja for Android</p>
            <p className="text-[13px] text-muted-foreground">Installed on this phone</p>
          </div>
        </div>
        <div className="cfg-readout-status" data-tone="ok">
          <Icon
            name="CheckCircleIcon"
            size={18}
            variant="solid"
            className="cfg-readout-status-icon"
          />
          <span>
            You&rsquo;re using the app. Reminders and scheduled jobs run even when it&rsquo;s
            closed.
          </span>
        </div>
      </div>
      <Notice>
        To update it, open this page in Chrome on your phone (Settings, then Install app) and
        download the app again. It installs over this copy and keeps your data.
      </Notice>
    </div>
  );
}

function AndroidApp({ env, apk }: { env: InstallEnv; apk: ApkMeta | null | 'loading' }) {
  const onPhone = env.platform === 'android';
  const available = apk !== null || APK_HOSTED_ELSEWHERE;
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(new URL(APK_URL, window.location.origin).href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  const meta =
    apk === 'loading'
      ? 'Checking the download…'
      : apk
        ? [
            apk.version && `Version ${apk.version}`,
            formatMegabytes(apk.bytes),
            apk.builtAt && `built ${formatDate(apk.builtAt)}`,
          ]
            .filter(Boolean)
            .join(', ')
        : available
          ? 'Android 7 or later'
          : 'Not published yet';

  return (
    <section aria-labelledby="install-android" className="space-y-3">
      <GroupHeading
        id="install-android"
        title="Android app"
        description={
          onPhone
            ? 'Recommended on Android. Reminders and scheduled AI jobs fire on time, even with the app closed.'
            : 'For your Android phone. Reminders and scheduled AI jobs fire on time, even with the app closed.'
        }
      />
      <div className="cfg-readout">
        <div className="flex flex-wrap items-center gap-x-[0.875rem] gap-y-4">
          <AppIconImage />
          <div className="min-w-0 flex-1 basis-[10rem]">
            <p className="cfg-app-name font-heading">LabNinja for Android</p>
            <p className="text-[13px] text-muted-foreground">{meta}</p>
          </div>
          {available && (
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <a
                href={APK_URL}
                download="LabNinja.apk"
                className={`todo-btn ${onPhone ? 'todo-btn-primary' : 'todo-btn-quiet'} h-10 flex-1 px-[1.125rem] text-[14px] sm:flex-none`}
              >
                <Icon name="ArrowDownTrayIcon" size={17} />
                Download APK
              </a>
              {!onPhone && (
                <button
                  type="button"
                  onClick={copyLink}
                  className="todo-btn todo-btn-quiet h-10 flex-1 px-[1.125rem] text-[14px] sm:flex-none"
                  aria-live="polite"
                >
                  <Icon name={copied ? 'CheckIcon' : 'LinkIcon'} size={17} />
                  {copied ? 'Link copied' : 'Copy link'}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="cfg-readout-status" data-tone="info">
          <Icon
            name={onPhone ? 'ShieldCheckIcon' : 'DevicePhoneMobileIcon'}
            size={18}
            className="cfg-readout-status-icon"
          />
          <span>
            {onPhone
              ? 'It comes straight from this site, not the Play Store, so Android asks you to allow it once.'
              : 'Open this page on your phone and tap Download APK, or copy the link and send it to yourself.'}
          </span>
        </div>
      </div>

      {!available && (
        <Notice tone="warn">
          The Android download isn&rsquo;t on this site yet. Build and publish it from a Mac with{' '}
          <code className={CODE}>./app/install_app.sh --publish</code>, then deploy.
        </Notice>
      )}

      {available && onPhone && (
        <div className="cfg-panel">
          <ol className="cfg-steps" aria-label="How to install the APK">
            <li>
              Tap <b>Download APK</b>. If Chrome asks whether to keep the file, tap{' '}
              <b>Download anyway</b>.
            </li>
            <li>
              Open the file when it finishes. The first time, Android asks you to let Chrome install
              apps: turn it on, then go back.
            </li>
            <li>
              Tap <b>Install</b>. If Play Protect says it doesn&rsquo;t know the app, tap{' '}
              <b>More details</b>, then <b>Install anyway</b>.
            </li>
          </ol>
          <p className="mt-3 border-t pt-3 text-[13px] leading-snug text-muted-foreground">
            Already have it? Download it again to update. It installs over the old copy and keeps
            your sign-in.
          </p>
        </div>
      )}
    </section>
  );
}

function WebApp({ env }: { env: InstallEnv }) {
  const { canInstall, installed, install } = useInstallPrompt();
  const [outcome, setOutcome] = useState<'' | 'dismissed' | 'unavailable'>('');

  const onInstall = async () => {
    const result = await install();
    setOutcome(result === 'accepted' ? '' : result);
  };

  const description =
    env.platform === 'ios'
      ? 'On iPhone and iPad this is how LabNinja installs. It is also what lets it send you notifications.'
      : env.platform === 'android'
        ? 'A lighter option: no download, it updates itself, and reminders work while it is open.'
        : 'Opens in its own window from your dock or taskbar, and updates itself.';

  let body: ReactNode;
  if (env.standalone || installed) {
    body = (
      <div className="cfg-row">
        <Icon name="CheckCircleIcon" size={22} variant="solid" className="shrink-0 text-success" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-foreground">Installed</p>
          <p className="text-[13px] leading-snug text-muted-foreground">
            {env.standalone
              ? 'You’re using the installed app right now.'
              : 'Open LabNinja from your home screen, dock or app list.'}
          </p>
        </div>
      </div>
    );
  } else if (canInstall) {
    body = (
      <div className="cfg-row flex-wrap">
        <div className="min-w-0 flex-1 basis-[12rem]">
          <p className="text-[15px] font-semibold text-foreground">Install LabNinja</p>
          <p className="text-[13px] leading-snug text-muted-foreground">
            Your browser asks you to confirm. It takes a second.
          </p>
        </div>
        <button
          type="button"
          onClick={onInstall}
          className="todo-btn todo-btn-primary h-10 px-[1.25rem] text-[14px]"
        >
          <Icon name="PlusCircleIcon" size={17} />
          Install
        </button>
      </div>
    );
  } else {
    body = <ManualSteps env={env} />;
  }

  return (
    <section aria-labelledby="install-web" className="space-y-3">
      <GroupHeading id="install-web" title="Web app" description={description} />
      <div className={canInstall || env.standalone || installed ? 'cfg-group' : 'cfg-panel'}>
        {body}
      </div>
      {outcome === 'dismissed' && (
        <Notice>
          Install was cancelled. You can still install from the browser menu whenever you like.
        </Notice>
      )}
      {outcome === 'unavailable' && (
        <Notice tone="warn">
          The browser didn&rsquo;t open its install window. Use its menu instead: look for Install
          app or Add to Home screen.
        </Notice>
      )}
    </section>
  );
}

/** When the browser has not handed over its install prompt: say where its own install command is. */
function ManualSteps({ env }: { env: InstallEnv }) {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const firefox = /Firefox|FxiOS/.test(ua);
  const safari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua);

  if (env.platform === 'ios') {
    return (
      <ol className="cfg-steps" aria-label="How to add LabNinja to your home screen">
        <li>
          Tap <b>Share</b>{' '}
          <Icon name="ArrowUpOnSquareIcon" size={17} className="cfg-step-glyph" aria-hidden /> in
          Safari&rsquo;s toolbar{firefox ? ' (or open this page in Safari first)' : ''}.
        </li>
        <li>
          Scroll down and tap <b>Add to Home Screen</b>.
        </li>
        <li>
          Tap <b>Add</b>. LabNinja now opens from your home screen, full screen.
        </li>
      </ol>
    );
  }

  if (env.platform === 'android') {
    return (
      <ol className="cfg-steps" aria-label="How to install the web app">
        <li>
          Open the browser menu{' '}
          <Icon name="EllipsisVerticalIcon" size={17} className="cfg-step-glyph" aria-hidden />.
        </li>
        <li>
          Tap <b>Install app</b> or <b>Add to Home screen</b>.
        </li>
        <li>Confirm. LabNinja appears with your other apps.</li>
      </ol>
    );
  }

  if (safari) {
    return (
      <ol className="cfg-steps" aria-label="How to add LabNinja to the Dock">
        <li>
          In the menu bar, choose <b>File</b>, then <b>Add to Dock</b>.
        </li>
        <li>
          Click <b>Add</b>. LabNinja opens from the Dock in its own window.
        </li>
      </ol>
    );
  }

  if (firefox) {
    return (
      <p className="text-[14px] leading-relaxed text-foreground">
        Firefox can&rsquo;t install web apps. Open this page in Chrome or Edge to install it, or in
        Safari on a Mac (File, then Add to Dock).
      </p>
    );
  }

  return (
    <ol className="cfg-steps" aria-label="How to install the web app">
      <li>
        Click the install icon{' '}
        <Icon name="ComputerDesktopIcon" size={17} className="cfg-step-glyph" aria-hidden /> at the
        right end of the address bar, or open the browser menu and choose <b>Install LabNinja</b>{' '}
        (in Chrome it&rsquo;s under <b>Cast, save and share</b>).
      </li>
      <li>
        Click <b>Install</b>. LabNinja opens in its own window and stays in your dock or taskbar.
      </li>
    </ol>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
