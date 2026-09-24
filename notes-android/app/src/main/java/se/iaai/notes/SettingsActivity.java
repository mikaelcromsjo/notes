package se.iaai.notes;

import android.app.Activity;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

public class SettingsActivity extends Activity {

    static final String PREFS = "notes_widget_prefs";
    static final String KEY_TOKEN = "widget_token";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_settings);

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        EditText tokenInput = findViewById(R.id.token_input);
        tokenInput.setText(prefs.getString(KEY_TOKEN, ""));

        TextView status = findViewById(R.id.sync_status);

        Button save = findViewById(R.id.save_button);
        save.setOnClickListener(v -> {
            String token = tokenInput.getText().toString().trim();
            prefs.edit().putString(KEY_TOKEN, token).apply();
            AgendaWidgetProvider.requestUpdateAll(this);
            Toast.makeText(this, "Saved", Toast.LENGTH_SHORT).show();
            finish();
        });

        // Normally nothing to do here at all — MainActivity syncs the token
        // automatically off the login cookie the first time it's missing. This
        // is the manual fallback: after a fresh login, after "Reset URL" in the
        // web app's account overlay, or if third-party-cookie restrictions ever
        // keep the automatic path from seeing the session cookie.
        Button sync = findViewById(R.id.sync_button);
        sync.setOnClickListener(v -> {
            status.setText("Syncing…");
            WidgetTokenSync.syncFromSession(getApplicationContext(), gotToken -> runOnUiThread(() -> {
                if (gotToken) {
                    tokenInput.setText(prefs.getString(KEY_TOKEN, ""));
                    status.setText("Synced");
                } else {
                    status.setText("Not signed in yet — open the app's main screen and log in first");
                }
            }));
        });
    }
}
