package se.iaai.notes;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.TimeZone;

/**
 * Self-contained native "push": no Firebase, no external account — a
 * self-rescheduling background poll (AlarmManager, setAndAllowWhileIdle so it
 * still fires under Doze) hitting the same token-authed
 * GET /api/widget?mode=agenda the agenda widget uses, raising a real system
 * notification for anything newly overdue/due today. Not instant — every
 * POLL_INTERVAL_MS at best, later under Doze — but it covers a real gap: the
 * PWA's own Web Push (server/webpush.js, alarm-scheduler.js) generally can't
 * wake a *closed* WebView-wrapped native app the way it wakes a real browser
 * tab or an installed WebAPK, so without this, background alarm delivery
 * silently doesn't happen at all in this app.
 */
public class ReminderPollReceiver extends BroadcastReceiver {

    private static final String PREFS = "notes_widget_prefs";
    private static final String CHANNEL_ID = "reminders";
    private static final String KEY_NOTIFIED = "poll_notified_keys";
    private static final long POLL_INTERVAL_MS = 20 * 60 * 1000; // 20 min, Doze permitting
    private static final int ALARM_REQUEST_CODE = 61001;

    // Called from MainActivity.onCreate (every launch — idempotent, just
    // moves the next trigger time out) and BootReceiver (alarms don't survive
    // a reboot on their own), plus by itself at the end of each poll.
    static void schedule(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent intent = new Intent(context, ReminderPollReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pending = PendingIntent.getBroadcast(context, ALARM_REQUEST_CODE, intent, flags);
        long triggerAt = System.currentTimeMillis() + POLL_INTERVAL_MS;
        // The non-"Exact" variant — no SCHEDULE_EXACT_ALARM permission dance,
        // appropriate since a poll is inherently approximate already.
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        Context appContext = context.getApplicationContext();
        PendingResult result = goAsync(); // network I/O doesn't belong on onReceive's own thread
        new Thread(() -> {
            try {
                poll(appContext);
            } finally {
                schedule(appContext); // always re-arm the next one, success or failure
                result.finish();
            }
        }).start();
    }

    private void poll(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String token = prefs.getString(SettingsActivity.KEY_TOKEN, "");
        if (token.isEmpty()) return; // not signed in yet — nothing to poll

        String baseUrl = context.getString(R.string.base_url);
        String tz = TimeZone.getDefault().getID();

        try {
            String urlStr = baseUrl + "/api/widget?token=" + token + "&mode=agenda&tz=" + tz;
            HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.setRequestProperty("Accept", "application/json");

            int status = conn.getResponseCode();
            if (status == 401) {
                // Same resync-off-the-login-cookie recovery the widgets use;
                // this cycle just skips notifying either way — next cycle
                // picks up wherever things stand with the refreshed token.
                WidgetTokenSync.syncFromSessionBlocking(context);
                return;
            }
            if (status != 200) return;

            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
            }

            JSONObject root = new JSONObject(sb.toString());
            JSONObject reminders = root.getJSONObject("reminders");
            JSONArray overdue = reminders.getJSONArray("overdue");
            JSONArray today = reminders.getJSONArray("today");

            JSONArray combined = new JSONArray();
            for (int i = 0; i < overdue.length(); i++) combined.put(overdue.get(i));
            for (int i = 0; i < today.length(); i++) combined.put(today.get(i));

            // Rebuilt fresh every cycle, not accumulated forever — an item
            // drops out once acknowledged/snoozed/completed in the app, and
            // reappearing later with a changed dueAt reads as new again. Same
            // idea as app.js's own alarmNotified set for its foreground
            // fallback notification.
            Set<String> previouslyNotified = prefs.getStringSet(KEY_NOTIFIED, new HashSet<>());
            Set<String> currentKeys = new HashSet<>();

            ensureChannel(context);
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

            for (int i = 0; i < combined.length(); i++) {
                JSONObject item = combined.getJSONObject(i);
                String noteId = item.optString("noteId", item.optString("id", ""));
                String dueAt = item.optString("dueAt", "");
                String key = noteId + "@" + dueAt;
                currentKeys.add(key);
                if (previouslyNotified.contains(key)) continue; // already shown, unchanged since

                String title = item.optString("title", "Reminder");
                String url = item.optString("url", baseUrl + "/");
                showNotification(context, nm, noteId, title, url);
            }

            prefs.edit().putStringSet(KEY_NOTIFIED, currentKeys).apply();

        } catch (Exception e) {
            // Offline, DNS hiccup, whatever — the next cycle just tries again.
        }
    }

    private void showNotification(Context context, NotificationManager nm, String noteId, String title, String url) {
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra("EXTRA_URL", url);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        int notifyId = noteId.hashCode(); // stable per note -> a later re-fire replaces rather than stacks
        PendingIntent pending = PendingIntent.getActivity(context, notifyId, open, flags);

        Notification n = new Notification.Builder(context, CHANNEL_ID)
                .setContentTitle("⏰ " + title)
                .setContentText("Tap to open")
                .setAutoCancel(true)
                .setContentIntent(pending)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .build();
        nm.notify(notifyId, n);
    }

    private void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Reminders", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Notes reminders that came due");
        nm.createNotificationChannel(channel);
    }
}
