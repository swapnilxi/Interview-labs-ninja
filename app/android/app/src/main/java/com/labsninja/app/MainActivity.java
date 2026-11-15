package com.labsninja.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.annotation.Nullable;
import com.getcapacitor.BridgeActivity;
import com.labsninja.app.scheduler.SchedulerPlugin;
import com.labsninja.app.scheduler.SchedulerStore;
import java.util.List;

public class MainActivity extends BridgeActivity {

    /** Set on taps of scheduler notifications: the in-app path (e.g. "/ai-todo?tab=schedule") the WebView should open. */
    public static final String EXTRA_HREF = "labninja_href";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins (not npm packages) are not in capacitor.plugins.json: register them before the bridge is built.
        registerPlugin(SchedulerPlugin.class);
        // A recreated activity, or a relaunch from Recents, gets the original tap intent again: that tap was handled.
        if (savedInstanceState != null || (getIntent().getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) {
            getIntent().removeExtra(EXTRA_HREF);
        }
        super.onCreate(savedInstanceState);
        // Without android/app/google-services.json, FirebaseApp is never initialised and
        // PushNotifications.register() throws on a plugin thread (an uncatchable crash). Tell the web code
        // whether FCM is usable through a user-agent token it checks before registering.
        try {
            if (firebaseConfigured() && getBridge() != null && getBridge().getWebView() != null) {
                WebSettings settings = getBridge().getWebView().getSettings();
                settings.setUserAgentString(settings.getUserAgentString() + " LabNinjaFcm");
            }
        } catch (Throwable ignored) {
            /* FCM stays disabled */
        }
        // Normally a no-op: BridgeActivity.load() already passed the launch intent through onNewIntent below.
        openHref(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openHref(intent);
    }

    /**
     * Opens a scheduler notification's target. On a cold start the bridge has already started loading server.url (the
     * Bridge constructor calls loadUrl inside super.onCreate); posting to the WebView queues this load after that one,
     * so it replaces the start page instead of being replaced by it.
     */
    private void openHref(@Nullable Intent intent) {
        if (intent == null || getBridge() == null || getBridge().getWebView() == null) return;
        String href = intent.getStringExtra(EXTRA_HREF);
        if (href == null) return;
        intent.removeExtra(EXTRA_HREF); // once per tap, however often this intent is seen again
        // Only paths: MainActivity is exported, so any app could send this extra; a path can't leave the site.
        if (!href.startsWith("/")) return;
        WebView webView = getBridge().getWebView();
        webView.post(() -> {
            String origin = originOf(SchedulerStore.origin(this));
            if (origin == null) origin = originOf(webView.getUrl());
            if (origin == null) origin = originOf(getBridge().getAppUrl());
            if (origin != null) webView.loadUrl(origin + href);
        });
    }

    /** "scheme://host[:port]" of an http(s) URL (no trailing slash, so origin + "/path" is clean), or null. */
    @Nullable
    private static String originOf(@Nullable String url) {
        if (url == null) return null;
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme();
        String authority = uri.getEncodedAuthority();
        if (authority == null || authority.isEmpty() || !("http".equals(scheme) || "https".equals(scheme))) return null;
        return scheme + "://" + authority.substring(authority.lastIndexOf('@') + 1);
    }

    /** Reflection: the Firebase classes live in the push plugin module, not on this module's compile classpath. */
    private boolean firebaseConfigured() {
        try {
            Object apps = Class.forName("com.google.firebase.FirebaseApp")
                .getMethod("getApps", android.content.Context.class)
                .invoke(null, this);
            return apps instanceof List && !((List<?>) apps).isEmpty();
        } catch (Throwable t) {
            return false;
        }
    }
}
