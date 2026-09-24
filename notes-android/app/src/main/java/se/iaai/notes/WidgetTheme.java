package se.iaai.notes;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * Applies the account's actual app theme (server/routes/widget.js's `theme`
 * field, from public/themes.js's effectiveColors — the same colours the web
 * app's chrome resolves to) onto the two RemoteViews widgets. Two hard limits
 * of classic RemoteViews keep this an approximation, not a pixel match:
 *   - no CSS gradients/blur/glow, so a photo/gradient theme background (e.g.
 *     Neon's radial-gradient page + card images) can only be represented as
 *     its flat colours, not the image itself;
 *   - no arbitrary custom typeface, so a theme's real vendored webfont maps
 *     onto whichever of Android's three built-in families it's closest to
 *     (see layoutFor) rather than actually being Inter/Nunito/Lora/JetBrains
 *     Mono/Orbitron.
 * What *does* carry over exactly: the resolved bg/surface/text/accent/muted
 * colours, live, from whatever theme (built-in or custom) is actually active
 * — not a hardcoded preset.
 */
class WidgetTheme {

    private static final String PREFS = "notes_widget_prefs";

    // themes.js's DEFAULT_COLORS (public/themes.js) — used until the first
    // successful fetch caches a real theme, so even a brand-new widget looks
    // like the app's default light theme rather than plain black-on-white.
    private static final String DEFAULT_BG = "#f4f5f7";
    private static final String DEFAULT_SURFACE = "#ffffff";
    private static final String DEFAULT_TEXT = "#1c1e21";
    private static final String DEFAULT_ACCENT = "#4f6df5";
    private static final String DEFAULT_MUTED = "#767a82";

    final int bg, surface, text, accent, muted, accentContrast;
    final String font;

    private WidgetTheme(int bg, int surface, int text, int accent, int muted, String font) {
        this.bg = bg;
        this.surface = surface;
        this.text = text;
        this.accent = accent;
        this.muted = muted;
        this.accentContrast = contrastFor(accent);
        this.font = font;
    }

    // Simple relative-luminance pick — same idea as themes.js's own
    // auto-contrast, just reimplemented client-side rather than trusting the
    // server to also ship every *-contrast pair (accent's is enough here).
    private static int contrastFor(int bgColor) {
        double r = Color.red(bgColor) / 255.0, g = Color.green(bgColor) / 255.0, b = Color.blue(bgColor) / 255.0;
        double lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        return lum > 0.45 ? Color.parseColor("#111111") : Color.parseColor("#ffffff");
    }

    private static int safeColor(JSONObject colors, String key, String fallback) {
        String hex = colors != null ? colors.optString(key, fallback) : fallback;
        try {
            return Color.parseColor(hex);
        } catch (IllegalArgumentException e) {
            return Color.parseColor(fallback);
        }
    }

    static WidgetTheme load(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return new WidgetTheme(
                Color.parseColor(prefs.getString("theme_bg", DEFAULT_BG)),
                Color.parseColor(prefs.getString("theme_surface", DEFAULT_SURFACE)),
                Color.parseColor(prefs.getString("theme_text", DEFAULT_TEXT)),
                Color.parseColor(prefs.getString("theme_accent", DEFAULT_ACCENT)),
                Color.parseColor(prefs.getString("theme_muted", DEFAULT_MUTED)),
                prefs.getString("theme_font", "system"));
    }

    // Parses the widget feed's `theme` object and both returns it (for
    // immediate use) and caches it, so the next widget update — even before
    // a fresh fetch completes — starts from the real theme, not the default.
    static WidgetTheme parseAndCache(Context context, JSONObject themeJson) {
        JSONObject colors = themeJson != null ? themeJson.optJSONObject("colors") : null;
        String bgHex = colors != null ? colors.optString("bg", DEFAULT_BG) : DEFAULT_BG;
        String surfaceHex = colors != null ? colors.optString("surface", DEFAULT_SURFACE) : DEFAULT_SURFACE;
        String textHex = colors != null ? colors.optString("text", DEFAULT_TEXT) : DEFAULT_TEXT;
        String accentHex = colors != null ? colors.optString("accent", DEFAULT_ACCENT) : DEFAULT_ACCENT;
        String mutedHex = colors != null ? colors.optString("muted", DEFAULT_MUTED) : DEFAULT_MUTED;
        String font = themeJson != null ? themeJson.optString("font", "system") : "system";

        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("theme_bg", bgHex)
                .putString("theme_surface", surfaceHex)
                .putString("theme_text", textHex)
                .putString("theme_accent", accentHex)
                .putString("theme_muted", mutedHex)
                .putString("theme_font", font)
                .apply();

        return new WidgetTheme(
                safeColor(colors, "bg", DEFAULT_BG),
                safeColor(colors, "surface", DEFAULT_SURFACE),
                safeColor(colors, "text", DEFAULT_TEXT),
                safeColor(colors, "accent", DEFAULT_ACCENT),
                safeColor(colors, "muted", DEFAULT_MUTED),
                font);
    }

    // themes.js's FONTS has five entries backed by real vendored webfonts;
    // Android's RemoteViews-safe type families are just serif/monospace/
    // (default sans). 'mono' (Neon's font) -> monospace, 'lora' (its only
    // serif) -> serif, everything else (system/inter/nunito/orbitron, all
    // sans in shape) -> the default layout.
    int gridLayout() {
        if ("mono".equals(font)) return R.layout.widget_grid_mono;
        if ("lora".equals(font)) return R.layout.widget_grid_serif;
        return R.layout.widget_grid;
    }

    int agendaLayout() {
        if ("mono".equals(font)) return R.layout.widget_agenda_mono;
        if ("lora".equals(font)) return R.layout.widget_agenda_serif;
        return R.layout.widget_agenda;
    }

    // One row of the agenda's scrollable list (AgendaRemoteViewsFactory) —
    // same font mapping as agendaLayout(), just for the per-item layout
    // instead of the widget's own root.
    int agendaRowLayout() {
        if ("mono".equals(font)) return R.layout.widget_agenda_row_mono;
        if ("lora".equals(font)) return R.layout.widget_agenda_row_serif;
        return R.layout.widget_agenda_row;
    }

    void applyToGridRoot(RemoteViews views) {
        views.setInt(R.id.widget_root, "setBackgroundColor", bg);
    }

    void applyToCell(RemoteViews views, int cellId, boolean isCenter) {
        if (isCenter) {
            views.setInt(cellId, "setBackgroundColor", accent);
            views.setTextColor(cellId, accentContrast);
        } else {
            views.setInt(cellId, "setBackgroundColor", surface);
            views.setTextColor(cellId, text);
        }
    }

    void applyToAgenda(RemoteViews views) {
        views.setInt(R.id.widget_root, "setBackgroundColor", bg);
        views.setTextColor(R.id.widget_summary, text);
        views.setTextColor(R.id.agenda_empty, muted);
        // Each row's own text colour is set individually in
        // AgendaRemoteViewsFactory.getViewAt(), which runs in a separate pass
        // (the list's rows aren't part of this RemoteViews tree at all).
    }
}
