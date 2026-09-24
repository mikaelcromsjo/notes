package se.iaai.notes;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import android.app.Activity;
import android.content.SharedPreferences;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

/**
 * Thin WebView wrapper around the notes.ia-ai.se PWA. Cookies persist across
 * launches (the app's own nico_sess cookie), and the same-origin service
 * worker is left to register itself exactly as it does in a real browser tab.
 */
public class MainActivity extends Activity {

    private static final int FILE_CHOOSER_REQUEST = 51426;
    private static final int RECORD_AUDIO_REQUEST = 51427;
    private static final int LOCATION_REQUEST = 51428;
    private static final int NOTIFICATIONS_REQUEST = 51429;

    private WebView webView;
    // A plain WebView answers neither "pick a file" (<input type=file>, used
    // by the photo/file attachment picker) nor "download this" (<a download>,
    // e.g. the account overlay's APK link) on its own — both need an explicit
    // WebChromeClient/DownloadListener, which is what the rest of this file
    // (onShowFileChooser, onPermissionRequest, the download listener below)
    // wires up. Without them the tap just does nothing, silently.
    private ValueCallback<Uri[]> filePathCallback;
    private PermissionRequest pendingPermissionRequest;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin;

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Content draws under the notch/cutout too (API 28+) instead of
        // letterboxing around it, so enableFullScreen() below is actually
        // edge-to-edge rather than just "no status bar, black cutout bar".
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        enableFullScreen();

        // Android 13+ requires this to be granted before any notification —
        // including ReminderPollReceiver's — can actually show. Harmless to
        // ask again on every launch; the system only prompts once either way.
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATIONS_REQUEST);
        }
        // Idempotent — just pushes the next poll out from now; the chain
        // otherwise self-sustains via ReminderPollReceiver.schedule() at the
        // end of each poll, and BootReceiver re-arms it after a reboot.
        ReminderPollReceiver.schedule(getApplicationContext());

        webView = new WebView(this);
        setContentView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setGeolocationEnabled(true);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            ServiceWorkerController swController = ServiceWorkerController.getInstance();
            swController.setServiceWorkerClient(new ServiceWorkerClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                    return null; // let the SW's own network/cache logic run untouched
                }
            });
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();
                if (host != null && host.endsWith("ia-ai.se")) {
                    return false; // stay inside the WebView
                }
                // Anything off-origin (e.g. a shared link) opens in the real browser.
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String finishedUrl) {
                super.onPageFinished(view, finishedUrl);
                // No token yet (fresh install, or before login completes) -> try to
                // pick one up now that a page has loaded and the session cookie (if
                // any) is set. Once a token is stored this is a no-op forever after
                // — SettingsActivity's "Sync" button covers re-sync after a token
                // reset or a login on a different account.
                SharedPreferences prefs = getSharedPreferences(SettingsActivity.PREFS, MODE_PRIVATE);
                if (prefs.getString(SettingsActivity.KEY_TOKEN, "").isEmpty()) {
                    WidgetTokenSync.syncFromSession(getApplicationContext(), null);
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            // <input type=file> (gallery photo, camera-capture photo, and the
            // plain "attach a file" picker all use this — the camera one just
            // carries FileChooserParams.isCaptureEnabled()). createIntent()
            // builds a stock chooser/camera intent from the accept types and
            // capture flag; the result comes back in onActivityResult below.
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                MainActivity.this.filePathCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                } catch (ActivityNotFoundException e) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }

            // The audio-note recorder (getUserMedia({audio:true}) + MediaRecorder
            // in app.js) needs both this WebView-level grant and the underlying
            // OS runtime permission — request the latter if it isn't already
            // held, then grant/deny once that resolves (onRequestPermissionsResult).
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                for (String resource : request.getResources()) {
                    if (!PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) continue;
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    } else {
                        pendingPermissionRequest = request;
                        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, RECORD_AUDIO_REQUEST);
                    }
                    return;
                }
                request.deny();
            }

            // Note location-tagging (getLocation()) and location-based reminders'
            // foreground geofence (geoWatchId in app.js) both run through plain
            // navigator.geolocation — same OS-runtime-permission bridge as mic
            // capture above, just a different Android permission/JS API pair.
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                boolean fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
                boolean coarse = checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
                if (fine || coarse) {
                    callback.invoke(origin, true, false);
                } else {
                    pendingGeoCallback = callback;
                    pendingGeoOrigin = origin;
                    requestPermissions(
                            new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
                            LOCATION_REQUEST);
                }
            }
        });

        // <a download> and any Content-Disposition: attachment response (the
        // account overlay's "Download APK" link, "Download backup (.zip)", a
        // note attachment's own download) — hand it to the system Download
        // Manager instead of the WebView just dropping it on the floor.
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            try {
                String filename = URLUtil.guessFileName(url, contentDisposition, mimeType);
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setMimeType(mimeType);
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null) request.addRequestHeader("Cookie", cookie);
                request.addRequestHeader("User-Agent", userAgent);
                request.setTitle(filename);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
                ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(request);
                Toast.makeText(this, "Downloading " + filename, Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "Download failed", Toast.LENGTH_SHORT).show();
            }
        });

        String url = resolveUrl(getIntent());
        if (url == null) url = getString(R.string.base_url) + "/";
        webView.loadUrl(url);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) return;

        Uri[] results = null;
        if (resultCode == RESULT_OK && data != null) {
            ClipData clipData = data.getClipData();
            if (clipData != null) {
                results = new Uri[clipData.getItemCount()];
                for (int i = 0; i < clipData.getItemCount(); i++) results[i] = clipData.getItemAt(i).getUri();
            } else if (data.getDataString() != null) {
                results = new Uri[]{Uri.parse(data.getDataString())};
            } else if (data.getExtras() != null && data.getExtras().get("data") instanceof Bitmap) {
                // Some camera apps hand back a small preview Bitmap instead of a
                // Uri when the capture intent carried no EXTRA_OUTPUT target —
                // stash it in our own cache so there's still a file to upload.
                Uri saved = saveCapturedThumbnail((Bitmap) data.getExtras().get("data"));
                if (saved != null) results = new Uri[]{saved};
            }
        }
        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
    }

    private Uri saveCapturedThumbnail(Bitmap bitmap) {
        try {
            File dir = new File(getCacheDir(), "camera");
            dir.mkdirs();
            File file = new File(dir, "capture_" + System.currentTimeMillis() + ".jpg");
            try (FileOutputStream out = new FileOutputStream(file)) {
                bitmap.compress(Bitmap.CompressFormat.JPEG, 90, out);
            }
            return Uri.fromFile(file);
        } catch (IOException e) {
            return null;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == RECORD_AUDIO_REQUEST && pendingPermissionRequest != null) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (granted) pendingPermissionRequest.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else pendingPermissionRequest.deny();
            pendingPermissionRequest = null;
        }

        if (requestCode == LOCATION_REQUEST && pendingGeoCallback != null) {
            boolean granted = false;
            for (int r : grantResults) if (r == PackageManager.PERMISSION_GRANTED) granted = true;
            pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String url = resolveUrl(intent);
        if (url != null) webView.loadUrl(url);
    }

    // Our own widget PendingIntents carry the target as EXTRA_URL; a tap on an
    // actual https://notes.ia-ai.se link (magic-link email, a shared note, App
    // Links VIEW intent) carries it as the intent's data URI instead.
    private String resolveUrl(Intent intent) {
        String extra = intent.getStringExtra("EXTRA_URL");
        if (extra != null) return extra;
        Uri data = intent.getData();
        return data != null ? data.toString() : null;
    }

    @Override
    protected void onPause() {
        super.onPause();
        // Both widgets dropped their manual refresh button along with the rest
        // of the header — this is what keeps them current instead: whatever you
        // changed in the app is likely to matter on the home screen right as you
        // leave it, so nudge both now rather than waiting for the next 30-min tick.
        AgendaWidgetProvider.requestUpdateAll(getApplicationContext());
        GridWidgetProvider.requestUpdateAll(getApplicationContext());
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // The system clears these flags on its own whenever focus is lost —
        // the notification shade, a permission dialog, switching away and
        // back — so they need reapplying every time focus returns, not just
        // once in onCreate.
        if (hasFocus) enableFullScreen();
    }

    // True edge-to-edge: status bar and navigation bar both hidden, "sticky
    // immersive" so a swipe in from either edge still temporarily reveals
    // them (for the system back/home gesture, or to check the clock) and
    // they auto-hide again afterwards rather than needing to be dismissed.
    // SYSTEM_UI_FLAG_* is deprecated in favor of WindowInsetsController
    // (API 30+), but still fully functional through current Android and, as
    // one call, covers this app's whole minSdk 26 range without a version
    // branch — not worth two code paths for a purely cosmetic toggle.
    @SuppressWarnings("deprecation")
    private void enableFullScreen() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }
}
