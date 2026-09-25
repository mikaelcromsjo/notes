package se.iaai.notes;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * A single rotating tile for the "soft nudge" reminders — public/app.js's
 * kind='anytime' (a day pattern + time window, no committed clock minute;
 * see db.js/alarm-scheduler.js: it never pushes, so this widget and the
 * web app's own session toast are its only surfaces). Each 30-min refresh
 * pulls whatever's currently due (GET /api/widget?token=...&mode=nudge,
 * server/routes/widget.js) and crossfades to the next one round-robin,
 * rather than always showing the same one — see fetchAndApply's cursor.
 * Tapping it opens that note; with nothing due it shows a calm "Nothing due"
 * rather than a forced tap target. Deliberately its own provider, not folded
 * into GridWidgetProvider or AgendaWidgetProvider — a different shape (one
 * item, not a grid or a scrolling list) with its own crossfade mechanics.
 */
public class NudgeWidgetProvider extends AppWidgetProvider {

    private static final String PREFS = "notes_widget_prefs";
    // A dropped connection (wifi handoff, DNS hiccup) shouldn't sit as
    // "Couldn't reach server" until the system's own 30-min update rolls
    // around (nudge_widget_info.xml) — back off and try again a couple of
    // times first, same as the other two widgets.
    private static final int MAX_NETWORK_RETRIES = 2;
    private static final int[] RETRY_DELAYS_MS = {3000, 8000};
    // The ViewFlipper's two children (widget_nudge*.xml) — alternating which
    // one gets the freshly-set text is what makes setDisplayedChild's
    // crossfade Animation actually visible; flipping to a child that already
    // shows the same text animates nothing.
    private static final int[] TEXT_IDS = {R.id.nudge_text_0, R.id.nudge_text_1};

    static void requestUpdateAll(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        ComponentName provider = new ComponentName(context, NudgeWidgetProvider.class);
        int[] ids = mgr.getAppWidgetIds(provider);
        if (ids.length == 0) return;
        Intent update = new Intent(context, NudgeWidgetProvider.class);
        update.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        update.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        context.sendBroadcast(update);
    }

    private static String childKey(int widgetId) {
        return "nudge_child_" + widgetId;
    }

    private static String cursorKey(int widgetId) {
        return "nudge_cursor_" + widgetId;
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int id : appWidgetIds) updateOne(context, appWidgetManager, id);
        // Piggybacks on the OS's own 30-min widget refresh cycle (rate-limited
        // internally to ~daily) rather than a separate wake-up of our own —
        // same as the other two widgets.
        UpdateChecker.maybeCheck(context);
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        SharedPreferences.Editor editor = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        for (int id : appWidgetIds) editor.remove(childKey(id)).remove(cursorKey(id));
        editor.apply();
    }

    private static Intent settingsIntent(Context context) {
        Intent intent = new Intent(context, SettingsActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return intent;
    }

    private void updateOne(Context context, AppWidgetManager appWidgetManager, int widgetId) {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);

        SharedPreferences prefs = context.getSharedPreferences(SettingsActivity.PREFS, Context.MODE_PRIVATE);
        String token = prefs.getString(SettingsActivity.KEY_TOKEN, "");

        if (token.isEmpty()) {
            WidgetTheme theme = WidgetTheme.load(context);
            RemoteViews views = new RemoteViews(context.getPackageName(), theme.nudgeLayout());
            theme.applyToNudgeRoot(views);
            showStatic(context, theme, views, widgetId, "Tap to set up",
                    PendingIntent.getActivity(context, widgetId, settingsIntent(context), flags), true);
            appWidgetManager.updateAppWidget(widgetId, views);
            return;
        }

        // No interim "Loading…" push — same "don't blank what's already on
        // screen" reasoning as GridWidgetProvider.updateOne.
        new Thread(() -> fetchAndApply(context, appWidgetManager, widgetId, token, flags, 0)).start();
    }

    // Writes `text` into whichever ViewFlipper child isn't currently
    // displayed and flips to it. Used for every non-rotating state (not set
    // up, reconnect, error, nothing due) as well as the rotating success path
    // below, so the crossfade also plays the moment an error clears or a
    // nudge appears, not just between two consecutive nudges.
    private static void showStatic(Context context, WidgetTheme theme, RemoteViews views, int widgetId,
                                    String text, PendingIntent onClick, boolean active) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int curChild = prefs.getInt(childKey(widgetId), 0);
        int textId = TEXT_IDS[curChild];
        theme.applyToNudgeTile(views, textId, active);
        views.setTextViewText(textId, text);
        if (onClick != null) views.setOnClickPendingIntent(textId, onClick);
        views.setDisplayedChild(R.id.nudge_flipper, curChild);
    }

    private void fetchAndApply(Context context, AppWidgetManager appWidgetManager, int widgetId,
                                String token, int flags, int attempt) {
        String baseUrl = context.getString(R.string.base_url);
        WidgetTheme fallbackTheme = WidgetTheme.load(context);
        RemoteViews views = new RemoteViews(context.getPackageName(), fallbackTheme.nudgeLayout());
        fallbackTheme.applyToNudgeRoot(views);

        try {
            String urlStr = baseUrl + "/api/widget?token=" + token + "&mode=nudge";
            HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            conn.setRequestProperty("Accept", "application/json");

            int status = conn.getResponseCode();

            // Stale/reset/never-set token — nothing to resync from (no
            // WebView, no login here), so just point at Settings.
            if (status == 401) {
                showStatic(context, fallbackTheme, views, widgetId, "Tap to reconnect",
                        PendingIntent.getActivity(context, widgetId, settingsIntent(context), flags), true);
                appWidgetManager.updateAppWidget(widgetId, views);
                return;
            }

            if (status != 200) {
                showStatic(context, fallbackTheme, views, widgetId, "Error (" + status + ")", null, false);
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

            // Real theme from this response — rebuild views against it, same
            // as the other two widgets.
            WidgetTheme theme = WidgetTheme.parseAndCache(context, root.optJSONObject("theme"));
            views = new RemoteViews(context.getPackageName(), theme.nudgeLayout());
            theme.applyToNudgeRoot(views);

            JSONArray nudges = root.optJSONArray("nudges");
            int count = nudges != null ? nudges.length() : 0;

            if (count == 0) {
                showStatic(context, theme, views, widgetId, "🌊 Nothing due", null, false);
                appWidgetManager.updateAppWidget(widgetId, views);
                return;
            }

            // Round-robin through whatever's due, one per refresh, instead of
            // always the same one — a cursor per widget instance, wrapped to
            // the current count (which can shrink between refreshes).
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            int cursor = ((prefs.getInt(cursorKey(widgetId), 0) % count) + count) % count;
            JSONObject chosen = nudges.getJSONObject(cursor);
            prefs.edit().putInt(cursorKey(widgetId), (cursor + 1) % count).apply();

            int curChild = prefs.getInt(childKey(widgetId), 0);
            int nextChild = 1 - curChild;
            int textId = TEXT_IDS[nextChild];

            theme.applyToNudgeTile(views, textId, true);
            views.setTextViewText(textId, "🌊 " + chosen.optString("title", "Untitled"));
            Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(chosen.optString("url", baseUrl + "/")));
            views.setOnClickPendingIntent(textId,
                    PendingIntent.getActivity(context, widgetId, open, flags));
            views.setDisplayedChild(R.id.nudge_flipper, nextChild);
            prefs.edit().putInt(childKey(widgetId), nextChild).apply();

        } catch (Exception e) {
            if (attempt < MAX_NETWORK_RETRIES) {
                showStatic(context, fallbackTheme, views, widgetId, "Couldn't reach server — retrying…", null, false);
                appWidgetManager.updateAppWidget(widgetId, views);
                try {
                    Thread.sleep(RETRY_DELAYS_MS[attempt]);
                } catch (InterruptedException ignored) {
                    return;
                }
                fetchAndApply(context, appWidgetManager, widgetId, token, flags, attempt + 1);
                return;
            }
            showStatic(context, fallbackTheme, views, widgetId, "Couldn't reach server", null, false);
        }

        appWidgetManager.updateAppWidget(widgetId, views);
    }
}
