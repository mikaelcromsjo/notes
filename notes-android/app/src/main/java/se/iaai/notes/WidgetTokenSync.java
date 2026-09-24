package se.iaai.notes;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.CookieManager;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Gets the widget feed token the same way the web app's account overlay does
 * — GET /api/session (server/routes/session.js), which mints one lazily and
 * hands it back as `widgetToken` for whoever the session cookie belongs to.
 * The WebView already holds that cookie after a normal login, so this reads
 * it straight from CookieManager instead of asking the user to copy/paste
 * anything from the account overlay.
 */
class WidgetTokenSync {

    interface Callback {
        void onResult(boolean gotToken);
    }

    static void syncFromSession(Context appContext, Callback callback) {
        new Thread(() -> {
            boolean got = tryFetchAndStore(appContext);
            if (callback != null) callback.onResult(got);
        }).start();
    }

    // Same thing, blocking — for a caller that's already on a background thread
    // (AgendaWidgetProvider, recovering from a 401) and wants the result inline
    // instead of a second round trip through the widget's own refresh cycle.
    static boolean syncFromSessionBlocking(Context appContext) {
        return tryFetchAndStore(appContext);
    }

    private static boolean tryFetchAndStore(Context appContext) {
        try {
            String baseUrl = appContext.getString(R.string.base_url);
            String cookie = CookieManager.getInstance().getCookie(baseUrl);
            if (cookie == null || cookie.isEmpty()) return false; // not logged in yet

            HttpURLConnection conn = (HttpURLConnection) new URL(baseUrl + "/api/session").openConnection();
            conn.setRequestProperty("Cookie", cookie);
            conn.setRequestProperty("Accept", "application/json");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            if (conn.getResponseCode() != 200) return false;

            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
            }

            JSONObject root = new JSONObject(sb.toString());
            if (root.isNull("user") || !root.has("widgetToken")) return false; // signed out
            String token = root.getString("widgetToken");

            SharedPreferences prefs = appContext.getSharedPreferences(SettingsActivity.PREFS, Context.MODE_PRIVATE);
            String existing = prefs.getString(SettingsActivity.KEY_TOKEN, "");
            if (!token.equals(existing)) {
                prefs.edit().putString(SettingsActivity.KEY_TOKEN, token).apply();
                AgendaWidgetProvider.requestUpdateAll(appContext);
            }
            return true;
        } catch (Exception e) {
            return false; // offline, DNS hiccup, etc. — caller just tries again later
        }
    }
}
