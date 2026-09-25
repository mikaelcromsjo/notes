package se.iaai.notes;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Opt-in, periodic (not continuous) GPS trail capture — piggybacked on the
 * grid widget's own ~30-min system refresh tick (GridWidgetProvider.onUpdate),
 * the same "no wake-up of our own" pattern UpdateChecker uses. Deliberately
 * passive: reads LocationManager's last cached fix rather than requesting an
 * active GPS session, so there's no foreground service, no persistent
 * notification, and nothing runs between ticks — a stale/missing fix just
 * means this tick is silently skipped (the trail will have gaps rather than
 * ever forcing a fix). Requires ACCESS_FINE_LOCATION (+
 * ACCESS_BACKGROUND_LOCATION on API 29+, since a widget tick counts as
 * "background" for location access), both granted from SettingsActivity, and
 * the user's own opt-in (KEY_TRAIL_ENABLED). Fine, not just coarse, matters
 * even for a passive read: Android fuzzes every location result to
 * ~city-block precision for an app holding only "Approximate location",
 * regardless of which provider actually supplied the fix. POSTs to
 * /api/widget/location?token=... (server/routes/widget.js), which itself also
 * rate-limits — MIN_INTERVAL_MS here just avoids firing that request twice
 * when the grid and agenda widgets happen to tick close together.
 */
final class LocationLogger {

    static final String KEY_TRAIL_ENABLED = "trail_enabled";
    private static final String KEY_LAST_ATTEMPT = "trail_last_attempt_ms";
    private static final long MIN_INTERVAL_MS = 20 * 60 * 1000; // under the 30-min tick, above one skipped tick
    private static final long MAX_FIX_AGE_MS = 2 * 60 * 60 * 1000; // a fix older than this isn't worth logging
    private static final String[] PROVIDERS = {
            LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER, LocationManager.PASSIVE_PROVIDER,
    };

    private LocationLogger() {}

    static boolean isEnabled(Context context) {
        return context.getSharedPreferences(SettingsActivity.PREFS, Context.MODE_PRIVATE)
                .getBoolean(KEY_TRAIL_ENABLED, false);
    }

    static void setEnabled(Context context, boolean enabled) {
        context.getSharedPreferences(SettingsActivity.PREFS, Context.MODE_PRIVATE)
                .edit().putBoolean(KEY_TRAIL_ENABLED, enabled).apply();
    }

    static boolean hasForegroundPermission(Context context) {
        return context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    // Pre-Android 10, foreground location permission already covers background
    // use — there's no separate grant to check.
    static boolean hasBackgroundPermission(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true;
        return context.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    static boolean isFullyGranted(Context context) {
        return hasForegroundPermission(context) && hasBackgroundPermission(context);
    }

    // Fire-and-forget, called off GridWidgetProvider.onUpdate — never touches
    // the widget's own RemoteViews, only logs to the server when everything
    // lines up (opted in, permitted, a token to post with, not too soon since
    // the last attempt, and a recent-enough cached fix actually available).
    static void maybeLog(Context context) {
        if (!isEnabled(context) || !isFullyGranted(context)) return;

        SharedPreferences prefs = context.getSharedPreferences(SettingsActivity.PREFS, Context.MODE_PRIVATE);
        String token = prefs.getString(SettingsActivity.KEY_TOKEN, "");
        if (token.isEmpty()) return;

        long now = System.currentTimeMillis();
        if (now - prefs.getLong(KEY_LAST_ATTEMPT, 0) < MIN_INTERVAL_MS) return;
        prefs.edit().putLong(KEY_LAST_ATTEMPT, now).apply();

        Location best = null;
        try {
            LocationManager lm = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
            if (lm == null) return;
            for (String provider : PROVIDERS) {
                if (!lm.isProviderEnabled(provider)) continue;
                Location loc = lm.getLastKnownLocation(provider);
                if (loc == null) continue;
                if (best == null || loc.getTime() > best.getTime()) best = loc;
            }
        } catch (SecurityException e) {
            return; // permission revoked between the check above and here
        }

        if (best == null || now - best.getTime() > MAX_FIX_AGE_MS) return; // nothing recent enough — skip this tick

        postLocation(context, token, best);
    }

    private static void postLocation(Context context, String token, Location loc) {
        String baseUrl = context.getString(R.string.base_url);
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("lat", loc.getLatitude());
                body.put("lon", loc.getLongitude());
                if (loc.hasAccuracy()) body.put("accuracy", loc.getAccuracy());
                body.put("recordedAt", isoFormat(loc.getTime()));

                URL url = new URL(baseUrl + "/api/widget/location?token=" + token);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setDoOutput(true);
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);
                conn.setRequestProperty("Content-Type", "application/json");
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
                conn.getResponseCode(); // drain — nothing to react to either way
                conn.disconnect();
            } catch (Exception ignored) {
                // Best-effort — the next tick (~30 min) tries again regardless.
            }
        }).start();
    }

    private static String isoFormat(long epochMs) {
        SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
        return fmt.format(new Date(epochMs));
    }
}
