package se.iaai.notes;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.UUID;

/**
 * The share sheet's / "Open with"'s "Notes" entry: whatever was shared
 * (ACTION_SEND / SEND_MULTIPLE, any type) or opened (ACTION_VIEW on a file)
 * goes as one multipart POST to {base_url}/api/widget/share?token=… — the
 * same body and note shapes as the PWA's own share target (server
 * routes/share.js): one file = an image/audio/contact/file note titled after
 * the file, several = one .zip note, text/link = a text note. Then the new
 * note is opened in the web app.
 *
 * Exists because Chrome can drop the file from a PWA share (the note arrived
 * empty) and has no "Open with" for web apps on Android. Translucent rather
 * than NoDisplay: it stays alive for the upload, since the read grant on a
 * shared content:// Uri only lasts as long as the receiving activity.
 */
public class ShareActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String token = getSharedPreferences(SettingsActivity.PREFS, MODE_PRIVATE)
                .getString(SettingsActivity.KEY_TOKEN, null);
        if (token == null || token.isEmpty()) {
            Toast.makeText(this, "Connect Notes first: paste the widget feed URL", Toast.LENGTH_LONG).show();
            startActivity(new Intent(this, SettingsActivity.class));
            finish();
            return;
        }
        Intent in = getIntent();
        ArrayList<Uri> files = sharedFiles(in);
        String subject = in.getStringExtra(Intent.EXTRA_SUBJECT);
        if (subject == null) subject = in.getStringExtra(Intent.EXTRA_TITLE);
        CharSequence text = in.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (files.isEmpty() && (text == null || text.length() == 0)) {
            Toast.makeText(this, "Nothing to save", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }
        Toast.makeText(this, "Saving to Notes…", Toast.LENGTH_SHORT).show();
        final String title = subject;
        final String body = text != null ? text.toString() : null;
        new Thread(() -> upload(token, title, body, files, in.getType())).start();
    }

    private static ArrayList<Uri> sharedFiles(Intent in) {
        ArrayList<Uri> out = new ArrayList<>();
        String action = in.getAction();
        if (Intent.ACTION_VIEW.equals(action) && in.getData() != null) {
            out.add(in.getData());
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> list = in.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) for (Uri u : list) if (u != null) out.add(u);
        } else if (Intent.ACTION_SEND.equals(action)) {
            Uri u = in.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) out.add(u);
        }
        // Some apps only attach the file as ClipData.
        ClipData clip = in.getClipData();
        if (out.isEmpty() && clip != null) {
            for (int i = 0; i < clip.getItemCount(); i++) {
                Uri u = clip.getItemAt(i).getUri();
                if (u != null) out.add(u);
            }
        }
        return out;
    }

    private void upload(String token, String title, String text, ArrayList<Uri> files, String intentType) {
        String boundary = "----notes" + UUID.randomUUID().toString().replace("-", "");
        HttpURLConnection conn = null;
        try {
            String url = getString(R.string.base_url) + "/api/widget/share?token="
                    + URLEncoder.encode(token, "UTF-8");
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(120000);
            conn.setDoOutput(true);
            conn.setRequestMethod("POST");
            conn.setChunkedStreamingMode(64 * 1024);
            conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
            try (OutputStream out = conn.getOutputStream()) {
                if (title != null && !title.isEmpty()) field(out, boundary, "title", title);
                if (text != null && !text.isEmpty()) field(out, boundary, "text", text);
                for (Uri u : files) {
                    String mime = getContentResolver().getType(u);
                    if (mime == null || mime.isEmpty()) mime = files.size() == 1 && intentType != null
                            && !intentType.contains("*") ? intentType : "application/octet-stream";
                    String head = "--" + boundary + "\r\n"
                            + "Content-Disposition: form-data; name=\"media\"; filename=\""
                            + displayName(u).replace("\"", "'").replace("\r", "").replace("\n", "") + "\"\r\n"
                            + "Content-Type: " + mime + "\r\n\r\n";
                    out.write(head.getBytes(StandardCharsets.UTF_8));
                    try (InputStream src = getContentResolver().openInputStream(u)) {
                        if (src == null) throw new java.io.IOException("can't read " + u);
                        byte[] buf = new byte[64 * 1024];
                        int n;
                        while ((n = src.read(buf)) > 0) out.write(buf, 0, n);
                    }
                    out.write("\r\n".getBytes(StandardCharsets.UTF_8));
                }
                out.write(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
            }
            int code = conn.getResponseCode();
            String resp = read(code < 400 ? conn.getInputStream() : conn.getErrorStream());
            if (code == 200) {
                long id = new JSONObject(resp).getLong("id");
                done("Saved to Notes", Uri.parse(getString(R.string.base_url) + "/#" + id), false);
            } else if (code == 401) {
                done("Notes token is no longer valid — paste it again", null, true);
            } else if (code == 413) {
                done("Too large for Notes", null, false);
            } else {
                String msg = "Couldn't save (" + code + ")";
                try {
                    msg = "Couldn't save: " + new JSONObject(resp).getString("error");
                } catch (Exception ignored) {
                }
                done(msg, null, false);
            }
        } catch (Exception e) {
            done("Couldn't reach Notes: " + e.getMessage(), null, false);
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void done(String message, Uri open, boolean reconnect) {
        runOnUiThread(() -> {
            Toast.makeText(this, message, Toast.LENGTH_LONG).show();
            try {
                if (open != null) startActivity(new Intent(Intent.ACTION_VIEW, open));
                else if (reconnect) startActivity(new Intent(this, SettingsActivity.class));
            } catch (Exception ignored) {
                // no browser / PWA to open it in — the note is saved anyway
            }
            finish();
        });
    }

    private String displayName(Uri u) {
        try (Cursor c = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getString(0);
        } catch (Exception ignored) {
            // not a queryable provider (file:// Uri) — fall back to the path
        }
        String last = u.getLastPathSegment();
        return last != null && !last.isEmpty() ? last : "shared-file";
    }

    private static void field(OutputStream out, String boundary, String name, String value) throws java.io.IOException {
        out.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n"
                + value + "\r\n").getBytes(StandardCharsets.UTF_8));
    }

    private static String read(InputStream in) throws java.io.IOException {
        if (in == null) return "";
        try (InputStream src = in) {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] b = new byte[8192];
            int n;
            while ((n = src.read(b)) > 0) buf.write(b, 0, n);
            return buf.toString("UTF-8");
        }
    }
}
