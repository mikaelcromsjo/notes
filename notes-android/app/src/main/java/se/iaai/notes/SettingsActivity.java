package se.iaai.notes;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
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
 * The app's only screen. This app has no login of its own and never shows
 * note content — it just holds the token the two home-screen widgets
 * (GridWidgetProvider/AgendaWidgetProvider) poll GET /api/widget with. Get
 * the actual app via "Add to Home Screen" on the web app; get this token from
 * that web app's own Account -> Integrate section ("Home-screen widget feed",
 * a URL of the form {base_url}/api/widget?token=... — copy button included)
 * and paste it (or just the bare token) below.
 */
public class SettingsActivity extends Activity {

    static final String PREFS = "notes_widget_prefs";
    static final String KEY_TOKEN = "widget_token";
    private static final int NOTIFICATIONS_REQUEST = 1001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_settings);

        // So UpdateChecker's "update available" nudge can actually show —
        // harmless to ask again on every open; the system only prompts once
        // either way, and the update banner below works with or without it.
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATIONS_REQUEST);
        }
        UpdateChecker.maybeCheck(this);
        showUpdateBannerIfPending();

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
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
