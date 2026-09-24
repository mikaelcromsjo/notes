package se.iaai.notes;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.ComponentName;
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
import java.util.ArrayList;
import java.util.List;
import java.util.TimeZone;

/**
 * Polls this account's read-only /api/widget?mode=agenda feed (token-authed,
 * server/routes/widget.js) and shows every overdue/today reminder, open
 * to-do, and orphaned note as its own row in a real scrolling list
 * (AgendaWidgetService/AgendaRemoteViewsFactory) — themed to match the app
 * (WidgetTheme). No header/refresh button — the system's own periodic update
 * (30 min) keeps it current. Tapping a row opens that note, tapping the
 * summary opens the full in-app agenda; both in whatever handles
 * notes.ia-ai.se (the installed PWA, or a browser) — this app has no WebView
 * of its own to open it in.
 */
public class AgendaWidgetProvider extends AppWidgetProvider {

    // A dropped connection (wifi handoff, DNS hiccup) shouldn't sit as
    // "Couldn't reach server" until the system's own 30-min update rolls
    // around (agenda_widget_info.xml) — back off and try again a couple of
    // times first.
    private static final int MAX_NETWORK_RETRIES = 2;
    private static final int[] RETRY_DELAYS_MS = {3000, 8000};
    private static final String KEY_ITEMS = "agenda_items_json";

    // Kicks every existing widget instance to refresh now — used by the
    // system's own update cycle and SettingsActivity right after saving a
    // new token.
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
        // Piggybacks on the OS's own 30-min widget refresh cycle (rate-limited
        // internally to ~daily) rather than a separate wake-up of our own.
        UpdateChecker.maybeCheck(context);
    }

    private static Intent settingsIntent(Context context) {
        Intent intent = new Intent(context, SettingsActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return intent;
    }

    // Wires up the list on every single RemoteViews this provider ever
    // builds (success, retry, error, not-set-up) rather than only on success:
    // a collection view's binding to its RemoteViewsService needs restating
    // on every full updateAppWidget call to keep working reliably, but the
    // *data* it shows is whatever loadCachedItems() last had persisted by a
    // genuine success below — so an error/retry state leaves the previous
    // good list on screen (same "don't blank it" reasoning as the grid
    // widget's own dropped "Loading…" push) rather than clearing it.
    private static void bindAgendaList(Context context, RemoteViews views, int widgetId, int flags) {
        views.setEmptyView(R.id.agenda_list, R.id.agenda_empty);
        views.setTextViewText(R.id.agenda_empty, "Nothing due");
        Intent serviceIntent = new Intent(context, AgendaWidgetService.class);
        serviceIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        // Collection widgets require a distinct Intent (by data Uri) per
        // widget instance, or the host may share/confuse their adapters —
        // the underlying data is account-wide either way (loadCachedItems
        // ignores widgetId), this is just to satisfy that requirement.
        serviceIntent.setData(Uri.parse("widget://agenda/" + widgetId));
        views.setRemoteAdapter(R.id.agenda_list, serviceIntent);
        // One shared template for every row's tap — a collection view can't
        // give each row its own full PendingIntent, only a template plus
        // each row's own "fill in the blanks" Intent (AgendaRemoteViewsFactory).
        views.setPendingIntentTemplate(R.id.agenda_list, PendingIntent.getActivity(
                context, widgetId * 10 + 1, new Intent(Intent.ACTION_VIEW), flags));
    }

    private static void finish(Context context, AppWidgetManager appWidgetManager, RemoteViews views, int widgetId, int flags) {
        bindAgendaList(context, views, widgetId, flags);
        appWidgetManager.updateAppWidget(widgetId, views);
        appWidgetManager.notifyAppWidgetViewDataChanged(widgetId, R.id.agenda_list);
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
            views.setTextViewText(R.id.widget_summary, "Tap to set up");
            PendingIntent openPending = PendingIntent.getActivity(context, widgetId, settingsIntent(context), flags);
            views.setOnClickPendingIntent(R.id.widget_summary, openPending);
            finish(context, appWidgetManager, views, widgetId, flags);
            return;
        }

        finish(context, appWidgetManager, views, widgetId, flags); // show current state immediately
        new Thread(() -> fetchAndApply(context, appWidgetManager, widgetId, token, flags, 0)).start();
    }

    private void fetchAndApply(Context context, AppWidgetManager appWidgetManager, int widgetId,
                                String token, int pendingFlags, int attempt) {
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

            // Stale/reset/never-set token — nothing to resync from (no WebView,
            // no login here), so just point at Settings to paste a fresh one.
            if (status == 401) {
                views.setTextViewText(R.id.widget_summary, "Tap to reconnect");
                PendingIntent openPending = PendingIntent.getActivity(context, 1000 + widgetId, settingsIntent(context), pendingFlags);
                views.setOnClickPendingIntent(R.id.widget_summary, openPending);
                finish(context, appWidgetManager, views, widgetId, pendingFlags);
                return;
            }

            if (status != 200) {
                views.setTextViewText(R.id.widget_summary, "Error (" + status + ")");
                finish(context, appWidgetManager, views, widgetId, pendingFlags);
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
            // Both new to this feed's Android client — server/agenda.js has
            // sent them all along (same fields the in-app 🔔 overlay's "Open
            // tasks"/"Orphaned notes" sections use), this just wasn't reading
            // them yet.
            JSONArray openTasks = root.optJSONArray("open_tasks");
            JSONArray orphans = root.optJSONArray("orphans");
            int openTasksCount = openTasks != null ? openTasks.length() : 0;

            String summary = overdue.length() + " overdue · " + today.length() + " today";
            if (openTasksCount > 0) summary += " · " + openTasksCount + " to-do";
            views.setTextViewText(R.id.widget_summary, summary);
            // The summary always opens the full in-app agenda, not any one
            // item — there's nothing there to disambiguate as "the" note.
            views.setOnClickPendingIntent(R.id.widget_summary, PendingIntent.getActivity(
                    context, widgetId * 10, new Intent(Intent.ACTION_VIEW, Uri.parse(baseUrl + "/?d=agenda")),
                    pendingFlags));

            // Every item, in priority order — overdue, then today's
            // reminders, then open to-dos, then orphans last (already capped
            // server-side at 20, server/agenda.js, same as everywhere else
            // orphans show up) — no further capping here: the list scrolls,
            // it doesn't need to fit a fixed handful of lines any more.
            JSONArray allItems = new JSONArray();
            addCategory(allItems, overdue, "Overdue");
            addCategory(allItems, today, "Today");
            addCategory(allItems, openTasks, "To-do");
            addCategory(allItems, orphans, "Orphan");
            saveItems(context, allItems);

        } catch (Exception e) {
            if (attempt < MAX_NETWORK_RETRIES) {
                views.setTextViewText(R.id.widget_summary, "Couldn't reach server — retrying…");
                finish(context, appWidgetManager, views, widgetId, pendingFlags);
                try {
                    Thread.sleep(RETRY_DELAYS_MS[attempt]);
                } catch (InterruptedException ignored) {
                    return;
                }
                fetchAndApply(context, appWidgetManager, widgetId, token, pendingFlags, attempt + 1);
                return;
            }
            views.setTextViewText(R.id.widget_summary, "Couldn't reach server");
            finish(context, appWidgetManager, views, widgetId, pendingFlags);
            return;
        }

        finish(context, appWidgetManager, views, widgetId, pendingFlags);
    }

    // Flattens a category's items into {label, url} rows appended to `dest` —
    // "Category: title" so a row reads unambiguously regardless of which list
    // it came from (previously a bare "• title" left to-dos/orphans/reminders
    // indistinguishable from each other).
    private static void addCategory(JSONArray dest, JSONArray src, String category) {
        if (src == null) return;
        for (int i = 0; i < src.length(); i++) {
            JSONObject obj = src.optJSONObject(i);
            if (obj == null) continue;
            try {
                JSONObject row = new JSONObject();
                row.put("label", category + ": " + obj.optString("title", "Untitled"));
                row.put("url", obj.optString("url", ""));
                dest.put(row);
            } catch (JSONException ignored) {
                // Can't actually happen (name/value are never null) — keep going.
            }
        }
    }

    private static void saveItems(Context context, JSONArray items) {
        context.getSharedPreferences(SettingsActivity.PREFS, Context.MODE_PRIVATE)
                .edit().putString(KEY_ITEMS, items.toString()).apply();
    }

    // Read by AgendaRemoteViewsFactory.onDataSetChanged() — never does its
    // own network fetch, just reflects whatever fetchAndApply last saved.
    static List<JSONObject> loadCachedItems(Context context) {
        String raw = context.getSharedPreferences(SettingsActivity.PREFS, Context.MODE_PRIVATE)
                .getString(KEY_ITEMS, "[]");
        List<JSONObject> list = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.optJSONObject(i);
                if (obj != null) list.add(obj);
            }
        } catch (JSONException ignored) {
            // Corrupt/missing cache — an empty list just shows "Nothing due"
            // until the next successful fetch overwrites it.
        }
        return list;
    }
}
