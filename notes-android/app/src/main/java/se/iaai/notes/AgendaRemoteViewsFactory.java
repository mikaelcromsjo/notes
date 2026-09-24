package se.iaai.notes;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * One row per agenda item — overdue/today reminders, open to-dos, orphaned
 * notes, all of them, not just however many fit on a fixed handful of lines.
 * Reads whatever AgendaWidgetProvider.fetchAndApply last persisted (this
 * class never does its own network fetch); onDataSetChanged() is called by
 * the widget host right before it re-reads getCount()/getViewAt(), typically
 * right after AppWidgetManager.notifyAppWidgetViewDataChanged() below.
 */
class AgendaRemoteViewsFactory implements RemoteViewsService.RemoteViewsFactory {

    private final Context context;
    private List<JSONObject> items = new ArrayList<>();

    AgendaRemoteViewsFactory(Context context) {
        this.context = context;
    }

    @Override
    public void onCreate() {
    }

    @Override
    public void onDataSetChanged() {
        items = AgendaWidgetProvider.loadCachedItems(context);
    }

    @Override
    public void onDestroy() {
        items = new ArrayList<>();
    }

    @Override
    public int getCount() {
        return items.size();
    }

    @Override
    public RemoteViews getViewAt(int position) {
        WidgetTheme theme = WidgetTheme.load(context);
        RemoteViews row = new RemoteViews(context.getPackageName(), theme.agendaRowLayout());
        JSONObject item = items.get(position);
        row.setTextViewText(R.id.row_text, item.optString("label", ""));
        row.setTextColor(R.id.row_text, theme.muted);

        // Merged into the ListView's PendingIntent template (set once, in
        // AgendaWidgetProvider) when this specific row is tapped — a
        // collection widget can't give each row its own full PendingIntent,
        // only its own "fill in the blanks" data for a shared template.
        String url = item.optString("url", "");
        if (!url.isEmpty()) {
            row.setOnClickFillInIntent(R.id.row_text, new Intent().setData(Uri.parse(url)));
        }
        return row;
    }

    @Override
    public RemoteViews getLoadingView() {
        return null; // default spinner is fine for how briefly this is ever visible
    }

    @Override
    public int getViewTypeCount() {
        return 1;
    }

    @Override
    public long getItemId(int position) {
        return position;
    }

    @Override
    public boolean hasStableIds() {
        return true;
    }
}
