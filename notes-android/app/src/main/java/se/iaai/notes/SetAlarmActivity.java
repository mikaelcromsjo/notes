package se.iaai.notes;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.AlarmClock;
import android.widget.Toast;

import java.util.ArrayList;

/**
 * The web app's "Add phone alarm" (note editor ⏰ menu, app.js
 * alarmIntentUrl): Chrome won't launch the clock app's own SET_ALARM intent
 * from a page (that activity isn't BROWSABLE), but it will launch this one via
 * an intent: URL —
 * iaainotes://alarm?hour=7&minutes=30&days=1,2&label=Title, days in JS
 * getDay() numbers (0 = Sunday). No UI of its own: hands an
 * AlarmClock.ACTION_SET_ALARM to whatever clock app is installed and closes.
 *
 * EXTRA_SKIP_UI stays false on purpose: any web page can fire this link, so
 * the clock app's own screen is the user's chance to see and back out of it.
 * One-way — the alarm can't be updated or removed from here later.
 */
public class SetAlarmActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            setAlarm(getIntent() != null ? getIntent().getData() : null);
        } finally {
            finish();
        }
    }

    private void setAlarm(Uri data) {
        if (data == null || !"alarm".equals(data.getHost())) return;
        int hour = parseInt(data.getQueryParameter("hour"), -1);
        int minutes = parseInt(data.getQueryParameter("minutes"), -1);
        if (hour < 0 || hour > 23 || minutes < 0 || minutes > 59) {
            Toast.makeText(this, "Invalid alarm time", Toast.LENGTH_SHORT).show();
            return;
        }
        String label = data.getQueryParameter("label");

        Intent alarm = new Intent(AlarmClock.ACTION_SET_ALARM)
                .putExtra(AlarmClock.EXTRA_HOUR, hour)
                .putExtra(AlarmClock.EXTRA_MINUTES, minutes)
                .putExtra(AlarmClock.EXTRA_SKIP_UI, false);
        if (label != null && !label.isEmpty()) {
            alarm.putExtra(AlarmClock.EXTRA_MESSAGE, label.length() > 100 ? label.substring(0, 100) : label);
        }
        ArrayList<Integer> days = new ArrayList<>();
        String daysParam = data.getQueryParameter("days");
        if (daysParam != null) {
            for (String d : daysParam.split(",")) {
                int js = parseInt(d.trim(), -1);
                // java.util.Calendar.SUNDAY = 1 ... SATURDAY = 7.
                if (js >= 0 && js <= 6 && !days.contains(js + 1)) days.add(js + 1);
            }
        }
        if (!days.isEmpty()) alarm.putExtra(AlarmClock.EXTRA_DAYS, days);

        try {
            startActivity(alarm);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "No clock app can set alarms", Toast.LENGTH_LONG).show();
        }
    }

    private static int parseInt(String s, int fallback) {
        if (s == null) return fallback;
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            return fallback;
        }
    }
}
