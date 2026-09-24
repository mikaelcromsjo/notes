package se.iaai.notes;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

/**
 * The app's only screen — but not what a plain launcher-icon tap shows once
 * it's actually configured: onCreate bounces straight past it to the real
 * app (ACTION_VIEW on base_url) in that case, since there's nothing to do
 * here. This UI only actually renders on first run, via the long-press
 * "Widget settings" shortcut, via a widget's own "Tap to set up/reconnect"
 * cell, via the update notification, or when there's an update to surface.
 * This app has no login of its own and never shows note content — it just
 * holds the token the two home-screen widgets (GridWidgetProvider/
 * AgendaWidgetProvider) poll GET /api/widget with. Get the actual app via
 * "Add to Home Screen" on the web app; get this token from that web app's own
 * Account -> Integrate section ("Home-screen widget feed", a URL of the form
 * {base_url}/api/widget?token=... — copy button included) and paste it (or
 * just the bare token) below.
 */
public class SettingsActivity extends Activity {

    static final String PREFS = "notes_widget_prefs";
    static final String KEY_TOKEN = "widget_token";
    private static final int NOTIFICATIONS_REQUEST = 1001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        boolean hasToken = !prefs.getString(KEY_TOKEN, "").isEmpty();
        UpdateChecker.maybeCheck(this); // cheap, rate-limited internally — fine to kick off even on the fast path below

        // A plain tap on the launcher icon — as opposed to the long-press
        // "Widget settings" shortcut, a widget's own "Tap to set up/reconnect"
        // cell, or the update notification, none of which carry ACTION_MAIN —
        // skips straight to the real app once it's actually configured and
        // nothing here needs attention. There's nothing to *do* on this screen
        // in that case.
        boolean isLauncherTap = Intent.ACTION_MAIN.equals(getIntent().getAction());
        if (isLauncherTap && hasToken && UpdateChecker.pendingUpdate(this) == null) {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(getString(R.string.base_url) + "/")));
            finish();
            return;
        }

        setContentView(R.layout.activity_settings);

        // So UpdateChecker's "update available" nudge can actually show —
        // harmless to ask again on every open; the system only prompts once
        // either way, and the update banner below works with or without it.
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATIONS_REQUEST);
        }
        showUpdateBannerIfPending();
        showInstalledVersion();

        EditText tokenInput = findViewById(R.id.token_input);
        TextView status = findViewById(R.id.sync_status);
        String existing = prefs.getString(KEY_TOKEN, "");
        tokenInput.setText(existing);
        status.setText(existing.isEmpty() ? "Not connected yet." : "Connected.");

        findViewById(R.id.open_app_button).setOnClickListener(v ->
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(getString(R.string.base_url) + "/"))));

        Button save = findViewById(R.id.save_button);
        save.setOnClickListener(v -> {
            String token = extractToken(tokenInput.getText().toString());
            if (token.isEmpty()) {
                status.setText("Paste the widget feed URL (or token) first.");
                return;
            }
            prefs.edit().putString(KEY_TOKEN, token).apply();
            tokenInput.setText(token); // reflect the extracted bare token back, not the pasted URL
            GridWidgetProvider.requestUpdateAll(this);
            AgendaWidgetProvider.requestUpdateAll(this);
            status.setText("Connected — widgets updating.");
            Toast.makeText(this, "Saved", Toast.LENGTH_SHORT).show();
        });
    }

    private void showUpdateBannerIfPending() {
        UpdateChecker.PendingUpdate update = UpdateChecker.pendingUpdate(this);
        TextView banner = findViewById(R.id.update_banner);
        Button button = findViewById(R.id.update_button);
        if (update == null) {
            banner.setVisibility(View.GONE);
            button.setVisibility(View.GONE);
            return;
        }
        banner.setText(update.versionName.isEmpty()
                ? "An update is available."
                : "Update available: v" + update.versionName);
        banner.setVisibility(View.VISIBLE);
        button.setVisibility(View.VISIBLE);
        button.setOnClickListener(v -> {
            UpdateChecker.startDownloadAndInstall(this);
            Toast.makeText(this, "Downloading update…", Toast.LENGTH_SHORT).show();
            button.setEnabled(false);
        });
    }

    // A number to compare against the web app's account overlay, which shows
    // the *latest published* build's version next to its own "Check for
    // updates" button (it has no way to see what's actually installed here —
    // that's native/OS-sandboxed state) — this is the other half of that.
    private void showInstalledVersion() {
        TextView label = findViewById(R.id.version_label);
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            label.setText("Notes Widgets v" + info.versionName);
        } catch (PackageManager.NameNotFoundException e) {
            label.setText("Notes Widgets");
        }
    }

    // Accepts either the full "Home-screen widget feed" URL the web app's
    // account overlay shows (…/api/widget?token=XYZ) or a bare token pasted
    // on its own, so copy-paste from that field just works either way.
    private static String extractToken(String pasted) {
        String trimmed = pasted.trim();
        if (trimmed.isEmpty()) return "";
        try {
            String fromQuery = Uri.parse(trimmed).getQueryParameter("token");
            if (fromQuery != null && !fromQuery.isEmpty()) return fromQuery;
        } catch (Exception ignored) {
            // Not a parseable URL — fall through and treat it as a bare token.
        }
        return trimmed;
    }
}
