package se.iaai.notes;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.TimeZone;

/**
 * Polls this account's read-only /api/widget?mode=agenda feed (token-authed,
 * server/routes/widget.js) and shows overdue/today reminder counts plus the
 * next couple of items, themed to match the app (WidgetTheme). No header/
 * refresh button — the system's own periodic update (30 min) keeps it
 * current, and MainActivity also nudges a refresh every time the app itself
 * is opened. Tapping the body opens the app to the next due item.
 */
public class AgendaWidgetProvider extends AppWidgetProvider {

    // A dropped connection (wifi handoff, DNS hiccup) shouldn't sit as
    // "Couldn't reach server" until the system's own 30-min update rolls
    // around (agenda_widget_info.xml) — back off and try again a couple of
    // times first, same idea as the 401 resync-and-retry-once below.
    private static final int MAX_NETWORK_RETRIES = 2;
    private static final int[] RETRY_DELAYS_MS = {3000, 8000};

    // Kicks every existing widget instance to refresh now — used by the
    // system's own update cycle, WidgetTokenSync after a token change, and
    // MainActivity whenever the app is opened (there's no in-widget refresh
    // control to do this any more).
    static void requestUpdateAll(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        ComponentName provider = new ComponentName(context, AgendaWidgetProvider.class);
        int[] ids = mgr.getAppWidgetIds(provider);
        if (ids.length == 0) return;
        Intent update = new Intent(context, AgendaWidgetProvider.class);
        update.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        update.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        context.sendBroadcast(update);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            updateOne(context, appWidgetManager, id);
        }
    }

    private void updateOne(Context context, AppWidgetManager appWidgetManager, int widgetId) {
        WidgetTheme theme = WidgetTheme.load(context); // last-known (or default) — real theme lands after fetch
        RemoteViews views = new RemoteViews(context.getPackageName(), theme.agendaLayout());
        theme.applyToAgenda(views);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);

        SharedPreferences prefs = context.getSharedPreferences(SettingsActivity.PREFS, Context.MODE_PRIVATE);
        String token = prefs.getString(SettingsActivity.KEY_TOKEN, "");

        if (token.isEmpty()) {
            // No manual setup step needed anymore — MainActivity syncs the token
            // itself off the login cookie the moment it's missing. Tapping just
            // opens the app to (re)log in; that alone is enough to arm this.
            views.setTextViewText(R.id.widget_summary, "Tap to sign in");
            views.setTextViewText(R.id.widget_line1, "");
            views.setTextViewText(R.id.widget_line2, "");
            Intent openIntent = new Intent(context, MainActivity.class);
            openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent openPending = PendingIntent.getActivity(context, widgetId, openIntent, flags);
            views.setOnClickPendingIntent(R.id.widget_summary, openPending);
            appWidgetManager.updateAppWidget(widgetId, views);
            return;
        }

        appWidgetManager.updateAppWidget(widgetId, views); // show current state immediately
        new Thread(() -> fetchAndApply(context, appWidgetManager, widgetId, token, flags, false, 0)).start();
    }

    private void fetchAndApply(Context context, AppWidgetManager appWidgetManager, int widgetId,
                                String token, int pendingFlags, boolean isRetry, int attempt) {
        String baseUrl = context.getString(R.string.base_url);
        String tz = TimeZone.getDefault().getID();

        WidgetTheme fallbackTheme = WidgetTheme.load(context);
        RemoteViews views = new RemoteViews(context.getPackageName(), fallbackTheme.agendaLayout());
        fallbackTheme.applyToAgenda(views);

        try {
            String urlStr = baseUrl + "/api/widget?token=" + token + "&mode=agenda&tz=" + tz;
            HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            conn.setRequestProperty("Accept", "application/json");

            int status = conn.getResponseCode();

            // The token that's stored went stale — invalid/missing, or reset from
            // the web app's account overlay. Re-derive it from the login cookie
            // (same path as MainActivity's first-run sync) and retry once before
            // giving up; this is what makes a "Reset URL" or a re-login on a
            // different account self-heal without a trip to Settings.
            if (status == 401 && !isRetry) {
                boolean resynced = WidgetTokenSync.syncFromSessionBlocking(context);
                if (resynced) {
                    SharedPreferences fresh = context.getSharedPreferences(SettingsActivity.PREFS, Context.MODE_PRIVATE);
                    String newToken = fresh.getString(SettingsActivity.KEY_TOKEN, "");
                    if (!newToken.isEmpty() && !newToken.equals(token)) {
                        fetchAndApply(context, appWidgetManager, widgetId, newToken, pendingFlags, true, 0);
                        return;
                    }
                }
                views.setTextViewText(R.id.widget_summary, "Sign in required");
                views.setTextViewText(R.id.widget_line1, "Tap to open the app");
                views.setTextViewText(R.id.widget_line2, "");
                Intent openIntent = new Intent(context, MainActivity.class);
                openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                PendingIntent openPending = PendingIntent.getActivity(context, 1000 + widgetId, openIntent, pendingFlags);
                views.setOnClickPendingIntent(R.id.widget_summary, openPending);
                views.setOnClickPendingIntent(R.id.widget_line1, openPending);
                appWidgetManager.updateAppWidget(widgetId, views);
                return;
            }

            if (status != 200) {
                views.setTextViewText(R.id.widget_summary, "Error (" + status + ")");
                views.setTextViewText(R.id.widget_line1, "");
                views.setTextViewText(R.id.widget_line2, "");
                appWidgetManager.updateAppWidget(widgetId, views);
                return;
            }

            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
            }

            JSONObject root = new JSONObject(sb.toString());

            WidgetTheme theme = WidgetTheme.parseAndCache(context, root.optJSONObject("theme"));
            views = new RemoteViews(context.getPackageName(), theme.agendaLayout());
            theme.applyToAgenda(views);

            JSONObject reminders = root.getJSONObject("reminders");
            JSONArray overdue = reminders.getJSONArray("overdue");
            JSONArray today = reminders.getJSONArray("today");

            views.setTextViewText(R.id.widget_summary,
                    overdue.length() + " overdue · " + today.length() + " today");

            // Show up to two upcoming items, overdue first.
            JSONArray combined = new JSONArray();
            for (int i = 0; i < overdue.length(); i++) combined.put(overdue.get(i));
            for (int i = 0; i < today.length(); i++) combined.put(today.get(i));

            String line1 = combined.length() > 0 ? itemLabel(combined.getJSONObject(0)) : "Nothing due";
            String line2 = combined.length() > 1 ? itemLabel(combined.getJSONObject(1)) : "";
            views.setTextViewText(R.id.widget_line1, line1);
            views.setTextViewText(R.id.widget_line2, line2);

            String tapUrl = combined.length() > 0
                    ? combined.getJSONObject(0).optString("url", baseUrl + "/")
                    : baseUrl + "/?d=agenda";
            Intent openIntent = new Intent(context, MainActivity.class);
            openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            openIntent.putExtra("EXTRA_URL", tapUrl);
            PendingIntent openPending = PendingIntent.getActivity(context, 1000 + widgetId, openIntent, pendingFlags);
            views.setOnClickPendingIntent(R.id.widget_summary, openPending);
            views.setOnClickPendingIntent(R.id.widget_line1, openPending);
            views.setOnClickPendingIntent(R.id.widget_line2, openPending);

        } catch (Exception e) {
            if (attempt < MAX_NETWORK_RETRIES) {
                views.setTextViewText(R.id.widget_summary, "Couldn't reach server — retrying…");
                views.setTextViewText(R.id.widget_line1, "");
                views.setTextViewText(R.id.widget_line2, "");
                appWidgetManager.updateAppWidget(widgetId, views);
                try {
                    Thread.sleep(RETRY_DELAYS_MS[attempt]);
                } catch (InterruptedException ignored) {
                    return;
                }
                fetchAndApply(context, appWidgetManager, widgetId, token, pendingFlags, isRetry, attempt + 1);
                return;
            }
            views.setTextViewText(R.id.widget_summary, "Couldn't reach server");
            views.setTextViewText(R.id.widget_line1, "");
            views.setTextViewText(R.id.widget_line2, "");
        }

        appWidgetManager.updateAppWidget(widgetId, views);
    }

    private String itemLabel(JSONObject item) {
        String title = item.optString("title", "Untitled");
        return "• " + title;
    }
}
