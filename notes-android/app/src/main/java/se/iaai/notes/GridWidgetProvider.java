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
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * A live, tappable 3x3 of the note graph, themed to match the web app: the
 * current note in the middle, its probable parent in the top-center cell
 * (same "back" convention as the app's own grid, public/app.js's BACK_SLOT),
 * up to 7 more linked neighbours filling the rest — all from
 * GET /api/widget?token=...&center=... (server/routes/widget.js, which now
 * shares the exact ranking/parent logic in server/neighbors.js with the
 * app's own GET /api/notes/:id/neighbors, not a separately-tuned
 * approximation of it). Tapping a neighbour (or the parent) re-centers the
 * widget on it in place; tapping the centre opens that note in whatever
 * handles notes.ia-ai.se (the installed PWA, or a browser) — this app has no
 * WebView of its own to open it in. Colours come live from the account's
 * actual app theme (WidgetTheme) — see that class for what can and can't
 * carry over into a RemoteViews widget.
 */
public class GridWidgetProvider extends AppWidgetProvider {

    private static final String ACTION_RECENTER = "se.iaai.notes.grid.RECENTER";
    private static final String EXTRA_NOTE_ID = "noteId";
    private static final String PREFS = "notes_widget_prefs";

    // Same shape as public/app.js's render(): outer slots in reading order,
    // slot 1 (top-center) reserved for the parent when there is one — see the
    // fill loop in fetchAndApply for the "skip slot 1 in the neighbour queue"
    // logic this mirrors.
    private static final int[] OUTER_SLOTS = {0, 1, 2, 3, 5, 6, 7, 8};
    private static final int BACK_SLOT = 1;
    // A dropped connection (wifi handoff, DNS hiccup) shouldn't sit as
    // "Couldn't reach server" until the system's own 30-min update rolls
    // around (grid_widget_info.xml) — back off and try again a couple of
    // times first.
    private static final int MAX_NETWORK_RETRIES = 2;
    private static final int[] RETRY_DELAYS_MS = {3000, 8000};
    private static final int[] CELL_IDS = {
            R.id.cell_0, R.id.cell_1, R.id.cell_2,
            R.id.cell_3, R.id.cell_4, R.id.cell_5,
            R.id.cell_6, R.id.cell_7, R.id.cell_8,
    };

    static void requestUpdateAll(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        ComponentName provider = new ComponentName(context, GridWidgetProvider.class);
        int[] ids = mgr.getAppWidgetIds(provider);
        if (ids.length == 0) return;
        Intent update = new Intent(context, GridWidgetProvider.class);
        update.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        update.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        context.sendBroadcast(update);
    }

    private static String centerKey(int widgetId) {
        return "grid_center_" + widgetId;
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int id : appWidgetIds) updateOne(context, appWidgetManager, id);
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        SharedPreferences.Editor editor = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        for (int id : appWidgetIds) editor.remove(centerKey(id));
        editor.apply();
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (!ACTION_RECENTER.equals(intent.getAction())) return;
        int widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1);
        if (widgetId == -1) return;
        String noteId = intent.getStringExtra(EXTRA_NOTE_ID);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putString(centerKey(widgetId), noteId).apply();
        updateOne(context, AppWidgetManager.getInstance(context), widgetId);
    }

    private void updateOne(Context context, AppWidgetManager appWidgetManager, int widgetId) {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);

        SharedPreferences prefs = context.getSharedPreferences(SettingsActivity.PREFS, Context.MODE_PRIVATE);
        String token = prefs.getString(SettingsActivity.KEY_TOKEN, "");

        if (token.isEmpty()) {
            WidgetTheme theme = WidgetTheme.load(context);
            RemoteViews views = new RemoteViews(context.getPackageName(), theme.gridLayout());
            theme.applyToGridRoot(views);
            theme.applyToCell(views, R.id.cell_4, true);
            views.setTextViewText(R.id.cell_4, "Tap to set up");
            views.setOnClickPendingIntent(R.id.cell_4,
                    PendingIntent.getActivity(context, widgetId * 100 + 4, settingsIntent(context), flags));
            appWidgetManager.updateAppWidget(widgetId, views);
            return;
        }

        // No interim "Loading…" push here: a RemoteViews replaces the whole
        // widget with only what it explicitly sets, so pushing one that only
        // touched cell_4 was blanking every other cell back to the layout's
        // default rather than just labelling the centre — a periodic refresh
        // looked like the grid emptying out for a moment. Leave whatever's
        // already on screen (the last successful fetch) alone until
        // fetchAndApply below actually has something new to show.
        String centerOverride = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(centerKey(widgetId), null);
        new Thread(() -> fetchAndApply(context, appWidgetManager, widgetId, token, centerOverride, flags, 0))
                .start();
    }

    private static Intent settingsIntent(Context context) {
        Intent intent = new Intent(context, SettingsActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return intent;
    }

    private void fetchAndApply(Context context, AppWidgetManager appWidgetManager, int widgetId,
                                String token, String centerOverride, int flags, int attempt) {
        String baseUrl = context.getString(R.string.base_url);
        // Fallback theme/layout for an error path reached before the real
        // theme (inside the response body) is parsed.
        WidgetTheme fallbackTheme = WidgetTheme.load(context);
        RemoteViews views = new RemoteViews(context.getPackageName(), fallbackTheme.gridLayout());
        fallbackTheme.applyToGridRoot(views);

        try {
            StringBuilder urlStr = new StringBuilder(baseUrl).append("/api/widget?token=").append(token);
            if (centerOverride != null) {
                urlStr.append("&center=").append(URLEncoder.encode(centerOverride, "UTF-8"));
            }
            HttpURLConnection conn = (HttpURLConnection) new URL(urlStr.toString()).openConnection();
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            conn.setRequestProperty("Accept", "application/json");

            int status = conn.getResponseCode();

            // Stale/reset/never-set token — nothing to resync from (no WebView,
            // no login here), so just point at Settings to paste a fresh one.
            if (status == 401) {
                fallbackTheme.applyToCell(views, R.id.cell_4, true);
                views.setTextViewText(R.id.cell_4, "Tap to reconnect");
                views.setOnClickPendingIntent(R.id.cell_4,
                        PendingIntent.getActivity(context, widgetId * 100 + 4, settingsIntent(context), flags));
                appWidgetManager.updateAppWidget(widgetId, views);
                return;
            }

            if (status != 200) {
                fallbackTheme.applyToCell(views, R.id.cell_4, true);
                views.setTextViewText(R.id.cell_4, "Error (" + status + ")");
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

            // Real theme from this response — rebuild views against it (right
            // layout for the font, right colours) rather than the fallback.
            WidgetTheme theme = WidgetTheme.parseAndCache(context, root.optJSONObject("theme"));
            views = new RemoteViews(context.getPackageName(), theme.gridLayout());
            theme.applyToGridRoot(views);

            JSONObject center = root.isNull("center") ? null : root.optJSONObject("center");

            if (center == null) {
                theme.applyToCell(views, R.id.cell_4, true);
                views.setTextViewText(R.id.cell_4, "No notes yet");
                appWidgetManager.updateAppWidget(widgetId, views);
                return;
            }

            theme.applyToCell(views, R.id.cell_4, true);
            views.setTextViewText(R.id.cell_4, center.optString("title", "(untitled)"));
            Intent openCenter = new Intent(Intent.ACTION_VIEW, Uri.parse(center.optString("url", baseUrl + "/")));
            views.setOnClickPendingIntent(R.id.cell_4,
                    PendingIntent.getActivity(context, widgetId * 100 + 4, openCenter, flags));

            JSONObject parent = root.isNull("parent") ? null : root.optJSONObject("parent");
            JSONArray neighbors = root.optJSONArray("neighbors");
            int neighborCount = neighbors != null ? neighbors.length() : 0;
            int neighborIndex = 0;

            for (int slot : OUTER_SLOTS) {
                int cellId = CELL_IDS[slot];
                JSONObject note = null;
                if (slot == BACK_SLOT && parent != null) {
                    note = parent;
                } else if (neighborIndex < neighborCount) {
                    note = neighbors.getJSONObject(neighborIndex++);
                }

                if (note == null) {
                    theme.applyToCell(views, cellId, false);
                    views.setTextViewText(cellId, "");
                    continue;
                }

                theme.applyToCell(views, cellId, false);
                views.setTextViewText(cellId, note.optString("title", "(untitled)"));
                String noteId = note.optString("id", null);
                if (noteId == null) continue;

                Intent recenter = new Intent(context, GridWidgetProvider.class);
                recenter.setAction(ACTION_RECENTER);
                recenter.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
                recenter.putExtra(EXTRA_NOTE_ID, noteId);
                views.setOnClickPendingIntent(cellId,
                        PendingIntent.getBroadcast(context, widgetId * 100 + slot, recenter, flags));
            }

        } catch (Exception e) {
            if (attempt < MAX_NETWORK_RETRIES) {
                fallbackTheme.applyToCell(views, R.id.cell_4, true);
                views.setTextViewText(R.id.cell_4, "Couldn't reach server — retrying…");
                appWidgetManager.updateAppWidget(widgetId, views);
                try {
                    Thread.sleep(RETRY_DELAYS_MS[attempt]);
                } catch (InterruptedException ignored) {
                    return;
                }
                fetchAndApply(context, appWidgetManager, widgetId, token, centerOverride, flags, attempt + 1);
                return;
            }
            fallbackTheme.applyToCell(views, R.id.cell_4, true);
            views.setTextViewText(R.id.cell_4, "Couldn't reach server");
        }

        appWidgetManager.updateAppWidget(widgetId, views);
    }
}
