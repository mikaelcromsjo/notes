package se.iaai.notes;

import android.Manifest;
import android.app.DownloadManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * This app isn't on the Play Store, so there's no store to auto-update it —
 * this is that mechanism instead: a tiny JSON manifest published next to the
 * APK ({base_url}/downloads/notes-version.json, regenerated on every rebuild,
 * see notes-android/CLAUDE.md) carries the latest versionCode. Checking,
 * notifying and downloading are all fully automatic; the final install step
 * is not and can't be — Android requires one explicit tap on the system
 * package installer to install an APK from outside the Play Store, no matter
 * what permissions this app holds.
 */
class UpdateChecker {

    private static final String PREFS = "notes_widget_prefs";
    private static final String KEY_LAST_CHECK = "update_last_check_at";
    private static final String KEY_PENDING_CODE = "update_pending_code";
    private static final String KEY_PENDING_NAME = "update_pending_name";
    private static final String KEY_NOTIFIED_CODE = "update_notified_code";
    // Callers (a widget's onUpdate, SettingsActivity.onCreate) can call
    // maybeCheck() freely — this gate is what keeps actual network checks
    // this infrequent regardless of how often the OS refreshes the widgets
    // (every 30 min). SettingsActivity's "Check for updates now" button
    // bypasses this entirely via checkNowForce(), for whenever a release is
    // known to be waiting and 6 hours is too long to sit on it.
    private static final long CHECK_INTERVAL_MS = 6L * 60 * 60 * 1000;
    private static final String CHANNEL_ID = "updates";

    static class PendingUpdate {
        final long versionCode;
        final String versionName;

        PendingUpdate(long versionCode, String versionName) {
            this.versionCode = versionCode;
            this.versionName = versionName;
        }
    }

    // Whatever the last successful check already found, no network I/O — safe
    // to call from onCreate to decide whether to show the update banner
    // immediately, before a fresh check (if due) completes in the background.
    static PendingUpdate pendingUpdate(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long code = prefs.getLong(KEY_PENDING_CODE, -1);
        if (code <= installedVersionCode(context)) return null;
        return new PendingUpdate(code, prefs.getString(KEY_PENDING_NAME, ""));
    }

    static void maybeCheck(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (System.currentTimeMillis() - prefs.getLong(KEY_LAST_CHECK, 0) < CHECK_INTERVAL_MS) return;
        Context appContext = context.getApplicationContext();
        new Thread(() -> checkNow(appContext)).start();
    }

    interface CheckCallback {
        void onResult(PendingUpdate found); // null = none found (up to date, or the check itself failed)
    }

    // Ignores CHECK_INTERVAL_MS entirely — a person tapping "Check for
    // updates now" has already decided this is worth a network round trip,
    // same reasoning as the web app's own "Check for updates" button.
    // `callback` runs on the main thread so it can touch views directly.
    static void checkNowForce(Context context, CheckCallback callback) {
        Context appContext = context.getApplicationContext();
        new Thread(() -> {
            checkNow(appContext);
            PendingUpdate found = pendingUpdate(appContext);
            if (callback != null) new Handler(Looper.getMainLooper()).post(() -> callback.onResult(found));
        }).start();
    }

    private static void checkNow(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putLong(KEY_LAST_CHECK, System.currentTimeMillis()).apply();
        try {
            String baseUrl = context.getString(R.string.base_url);
            HttpURLConnection conn = (HttpURLConnection)
                    new URL(baseUrl + "/downloads/notes-version.json").openConnection();
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            if (conn.getResponseCode() != 200) return;

            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
            }
            JSONObject root = new JSONObject(sb.toString());
            long remoteCode = root.optLong("versionCode", -1);
            String remoteName = root.optString("versionName", "");
            if (remoteCode <= installedVersionCode(context)) return;

            prefs.edit()
                    .putLong(KEY_PENDING_CODE, remoteCode)
                    .putString(KEY_PENDING_NAME, remoteName)
                    .apply();

            // One notification per new versionCode, not one per check.
            if (prefs.getLong(KEY_NOTIFIED_CODE, -1) != remoteCode) {
                prefs.edit().putLong(KEY_NOTIFIED_CODE, remoteCode).apply();
                notifyUpdateAvailable(context, remoteName);
            }
        } catch (Exception e) {
            // Offline, DNS hiccup, whatever — the next due check just tries again.
        }
    }

    private static void notifyUpdateAvailable(Context context, String versionName) {
        if (Build.VERSION.SDK_INT >= 33
                && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
            return; // not granted — the Settings banner still covers it next time it's opened
        }
        ensureChannel(context);
        Intent open = new Intent(context, SettingsActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pending = PendingIntent.getActivity(context, 0, open, flags);

        Notification n = new Notification.Builder(context, CHANNEL_ID)
                .setContentTitle("Notes Widgets update available")
                .setContentText(versionName.isEmpty() ? "Tap to install" : "v" + versionName + " — tap to install")
                .setAutoCancel(true)
                .setContentIntent(pending)
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .build();
        ((NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE)).notify(1, n);
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
        nm.createNotificationChannel(new NotificationChannel(
                CHANNEL_ID, "App updates", NotificationManager.IMPORTANCE_DEFAULT));
    }

    // Downloads the current APK via DownloadManager — its default destination
    // (no setDestinationInExternalPublicDir call) is its own managed area, so
    // no storage permission is needed on any API level, and it hands back
    // only a content:// Uri, never a raw file path. Once the download lands,
    // that Uri goes straight to the system package installer; the one tap
    // that follows there is unavoidable (see class doc comment).
    static void startDownloadAndInstall(Context context) {
        String apkUrl = context.getString(R.string.base_url) + "/downloads/notes.apk";
        DownloadManager dm = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(apkUrl));
        request.setTitle("Notes Widgets update");
        request.setMimeType("application/vnd.android.package-archive");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        long downloadId = dm.enqueue(request);

        Context appContext = context.getApplicationContext();
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) != downloadId) return;
                ctx.unregisterReceiver(this);
                Uri apkUri = dm.getUriForDownloadedFile(downloadId);
                if (apkUri == null) return; // download failed — DownloadManager's own notification already said so
                ctx.startActivity(new Intent(Intent.ACTION_VIEW)
                        .setDataAndType(apkUri, "application/vnd.android.package-archive")
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION));
            }
        };
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) {
            appContext.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            appContext.registerReceiver(receiver, filter);
        }
    }

    private static long installedVersionCode(Context context) {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
        } catch (PackageManager.NameNotFoundException e) {
            return Long.MAX_VALUE; // shouldn't happen — never claim an "update" if we can't tell our own version
        }
    }
}
