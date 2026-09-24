package se.iaai.notes;

import android.content.Intent;
import android.widget.RemoteViewsService;

/**
 * Backs the agenda widget's scrollable list (widget_agenda.xml's
 * @+id/agenda_list) — see AgendaRemoteViewsFactory for what actually fills
 * it. Registered in AndroidManifest.xml with BIND_REMOTEVIEWS; the system
 * binds to it whenever the widget host needs to (re)populate that list, most
 * often right after AgendaWidgetProvider calls notifyAppWidgetViewDataChanged.
 */
public class AgendaWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new AgendaRemoteViewsFactory(getApplicationContext());
    }
}
