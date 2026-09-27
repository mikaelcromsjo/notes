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
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.TimeZone;

/**
 * A single rotating tile for the "soft nudge" reminders — public/app.js's
 * kind='anytime' (a day pattern + time window, no committed clock minute;
 * see db.js/alarm-scheduler.js: it never pushes, so this widget and the
 * web app's own session toast are its only surfaces). Each 30-min refresh
 * pulls every nudge that's *in range* today — due already or scheduled for
 * later today, not just the ones whose exact picked minute has already
 * passed (GET /api/widget?token=...&mode=nudge&tz=..., server/routes/widget.js)
 * — caches that whole list (KEY_CACHE, account-wide like AgendaWidgetProvider's
 * own item cache) and crossfades through it round-robin, one per refresh
 * (applyNudgeRotation's cursor), rather than only ever showing whichever one
 * happens to be exactly due at fetch time. On a dropped connection it keeps
 * rotating through that same cache instead of replacing it with an error
 * tile — see fetchAndApply's catch block. Tapping the tile opens that note;
 * with nothing in range it shows a calm "Nothing due" rather than a forced
 * tap target. Deliberately its own provider, not folded into
 * GridWidgetProvider or AgendaWidgetProvider — a different shape (one item,
 * not a grid or a scrolling list) with its own crossfade mechanics.
 */
public class NudgeWidgetProvider extends AppWidgetProvider {

    private static final String PREFS = "notes_widget_prefs";
    // The last successfully-fetched ?mode=nudge list, account-wide (not
    // per-widget-id — there's only one account's worth of nudges regardless
    // of how many widget instances are showing them).
    private static final String KEY_CACHE = "nudge_cache_json";
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
        // KEY_CACHE is deliberately left alone — it's account-wide, not tied
        // to any one widget instance (same reasoning as AgendaWidgetProvider's
        // own item cache never being cleared here).
    }

    private static Intent settingsIntent(Context context) {
        Intent intent = new Intent(context, SettingsActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return intent;
    }

    private static void saveCache(Context context, JSONArray nudges) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putString(KEY_CACHE, nudges.toString()).apply();
    }

    // null when there's genuinely nothing cached yet (fresh install, or the
    // very first fetch ever failed) — distinct from an empty JSONArray, which
    // means the last real fetch legitimately found nothing in range.
    private static JSONArray loadCache(Context context) {
        String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_CACHE, null);
        if (raw == null) return null;
        try {
            return new JSONArray(raw);
        } catch (JSONException e) {
            return null;
        }
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

    // Picks the next item from `nudges` (a per-widget-instance round-robin
    // cursor, wrapped to the current count so a shrinking/growing list
    // between refreshes never indexes out of range) and crossfades the
    // ViewFlipper to it. `nudges` must be non-empty — both call sites below
    // handle "empty" as their own state before reaching here. `due` (server's
    // ?mode=nudge field — has this one's picked moment actually arrived, or
    // is it just scheduled for later today) picks the accent-vs-quiet tile
    // styling, same convention as GridWidgetProvider's centre cell.
    private static void applyNudgeRotation(Context context, WidgetTheme theme, RemoteViews views,
                                            int widgetId, int flags, String baseUrl, JSONArray nudges) {
        int count = nudges.length();
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int cursor = ((prefs.getInt(cursorKey(widgetId), 0) % count) + count) % count;
        JSONObject chosen = nudges.optJSONObject(cursor);
        prefs.edit().putInt(cursorKey(widgetId), (cursor + 1) % count).apply();
        if (chosen == null) return; // shouldn't happen — malformed cache entry; leave the tile as-is

        int curChild = prefs.getInt(childKey(widgetId), 0);
        int nextChild = 1 - curChild;
        int textId = TEXT_IDS[nextChild];

        theme.applyToNudgeTile(views, textId, chosen.optBoolean("due", true));
        views.setTextViewText(textId, "🌊 " + chosen.optString("title", "Untitled"));
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(chosen.optString("url", baseUrl + "/")));
        views.setOnClickPendingIntent(textId, PendingIntent.getActivity(context, widgetId, open, flags));
        views.setDisplayedChild(R.id.nudge_flipper, nextChild);
        prefs.edit().putInt(childKey(widgetId), nextChild).apply();
    }

    private void fetchAndApply(Context context, AppWidgetManager appWidgetManager, int widgetId,
                                String token, int flags, int attempt) {
        String baseUrl = context.getString(R.string.base_url);
        String tz = TimeZone.getDefault().getID();
        WidgetTheme fallbackTheme = WidgetTheme.load(context);
        RemoteViews views = new RemoteViews(context.getPackageName(), fallbackTheme.nudgeLayout());
        fallbackTheme.applyToNudgeRoot(views);

        try {
            String urlStr = baseUrl + "/api/widget?token=" + token + "&mode=nudge&tz=" + tz;
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
            if (nudges == null) nudges = new JSONArray();
            // A genuine successful fetch is authoritative even when empty —
            // cache it either way, so a *later* dropped connection falls back
            // to today's real state instead of something stale from before
            // this fetch.
            saveCache(context, nudges);

            if (nudges.length() == 0) {
                showStatic(context, theme, views, widgetId, "🌊 Nothing due", null, false);
                appWidgetManager.updateAppWidget(widgetId, views);
                return;
            }

            applyNudgeRotation(context, theme, views, widgetId, flags, baseUrl, nudges);

        } catch (Exception e) {
            // No network (DNS/timeout/connection refused, as opposed to a real
            // HTTP response like 401/500 above) — retry silently rather than
            // overwriting the tile with a "retrying…" warning, same as the
            // other two widgets. Once retries are exhausted, keep cycling
            // whatever was last successfully fetched (loadCache) rather than
            // replacing it with an error tile; when there's truly nothing
            // cached yet (fresh install, first fetch ever failed), leave the
            // tile exactly as it already is instead of pushing an error
            // message onto it.
            if (attempt < MAX_NETWORK_RETRIES) {
                try {
                    Thread.sleep(RETRY_DELAYS_MS[attempt]);
                } catch (InterruptedException ignored) {
                    return;
                }
                fetchAndApply(context, appWidgetManager, widgetId, token, flags, attempt + 1);
                return;
            }
            JSONArray cached = loadCache(context);
            if (cached != null && cached.length() > 0) {
                applyNudgeRotation(context, fallbackTheme, views, widgetId, flags, baseUrl, cached);
            } else {
                return;
            }
        }

        appWidgetManager.updateAppWidget(widgetId, views);
    }
}
