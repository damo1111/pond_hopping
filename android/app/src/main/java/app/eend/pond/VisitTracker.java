package app.eend.pond;

import android.Manifest;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

/**
 * Visit-based location history, Android side.
 *
 * iOS has CLVisit: you ask the system "tell me when this person stops
 * somewhere", and it answers, cheaply, and relaunches the app to do it.
 * Android has nothing of the kind. What it does have is a location request
 * that can be delivered by PendingIntent to a BroadcastReceiver — which
 * survives the process being killed, exactly like CLVisit does — so the
 * stops themselves are worked out here, from a slow trickle of fixes.
 *
 * That trickle is deliberately slow. The request asks for a fix every five
 * minutes at most, and only when you've moved a hundred metres; Android then
 * throttles it further to a handful an hour whenever the app isn't in front
 * of you. A visit is a place you stayed for a quarter of an hour, so a
 * quarter of an hour of resolution is enough, and the battery cost of asking
 * for more would be the whole feature's reputation.
 *
 * The honest difference from iOS: arrival and departure times are rounded to
 * whatever the trickle happened to deliver, so they are coarser. Everything
 * downstream — the buffer, the keys, the upload, the day map — is identical.
 *
 * No Play Services. LocationManager is in the platform, works on every
 * device including the ones without Google's apps on them, and adds nothing
 * to the APK.
 */
public final class VisitTracker {

    /** Somewhere you were, rather than somewhere you drove through. */
    private static final long MIN_STAY_MS = 12 * 60 * 1000L;

    /** Two fixes this close together are the same place, not two places. */
    private static final float STAY_RADIUS_M = 200f;

    private static final long MIN_TIME_MS = 5 * 60 * 1000L;
    private static final float MIN_DIST_M = 100f;

    /**
     * Visits are tiny and arrive a handful of times a day, but a phone that
     * goes months without opening the app shouldn't grow without bound.
     * Oldest go first — recent movement is the part still worth uploading.
     */
    private static final int MAX_BUFFERED = 500;

    private static final String PREFS = "pond.visits";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_BUFFER = "buffer";
    private static final String KEY_ASKED = "asked";
    private static final String ANCHOR_LAT = "anchor.lat";
    private static final String ANCHOR_LON = "anchor.lon";
    private static final String ANCHOR_ACC = "anchor.acc";
    private static final String ANCHOR_FIRST = "anchor.first";
    private static final String ANCHOR_LAST = "anchor.last";

    static final String ACTION = "app.eend.pond.LOCATION_UPDATE";

    private VisitTracker() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ------------------------------------------------------------ state

    public static boolean isEnabled(Context ctx) {
        return prefs(ctx).getBoolean(KEY_ENABLED, false);
    }

    /**
     * The same five words iOS uses, so the web layer needs no idea which
     * platform it is on.
     *
     * "always" is background location; "whenInUse" is foreground only, which
     * on Android as on iOS still records perfectly well while the app is
     * open. The difference between never-asked and refused matters because
     * only one of them can be fixed by asking again.
     */
    public static String authorization(Context ctx) {
        if (granted(ctx, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            || (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && granted(ctx, Manifest.permission.ACCESS_FINE_LOCATION))) {
            // Before Android 10 there was no separate background permission:
            // foreground access was background access.
            return "always";
        }
        if (granted(ctx, Manifest.permission.ACCESS_FINE_LOCATION)
            || granted(ctx, Manifest.permission.ACCESS_COARSE_LOCATION)) {
            return "whenInUse";
        }
        return prefs(ctx).getBoolean(KEY_ASKED, false) ? "denied" : "notDetermined";
    }

    static void markAsked(Context ctx) {
        prefs(ctx).edit().putBoolean(KEY_ASKED, true).apply();
    }

    private static boolean granted(Context ctx, String permission) {
        return ContextCompat.checkSelfPermission(ctx, permission) == PackageManager.PERMISSION_GRANTED;
    }

    // --------------------------------------------------------- recording

    public static void start(Context ctx) {
        prefs(ctx).edit().putBoolean(KEY_ENABLED, true).apply();
        register(ctx);
    }

    public static void stop(Context ctx) {
        prefs(ctx).edit().putBoolean(KEY_ENABLED, false).apply();
        LocationManager lm = manager(ctx);
        if (lm != null) {
            try {
                lm.removeUpdates(pendingIntent(ctx));
            } catch (SecurityException ignored) {
                // Nothing to remove without the permission that registered it.
            }
        }
        clearAnchor(ctx);
    }

    /**
     * Called on every launch and after a reboot. The request itself does not
     * survive either — unlike iOS's visit monitoring, Android drops
     * PendingIntent location requests when the process dies for good and
     * always on reboot — so it is re-registered rather than assumed.
     */
    public static void resumeIfEnabled(Context ctx) {
        if (isEnabled(ctx)) register(ctx);
    }

    private static void register(Context ctx) {
        LocationManager lm = manager(ctx);
        if (lm == null) return;
        String provider = provider(lm);
        if (provider == null) return;
        try {
            lm.requestLocationUpdates(provider, MIN_TIME_MS, MIN_DIST_M, pendingIntent(ctx));
        } catch (SecurityException | IllegalArgumentException ignored) {
            // No permission yet, or no such provider on this device. Either
            // way the switch stays on and the next resume tries again.
        }
    }

    private static LocationManager manager(Context ctx) {
        return (LocationManager) ctx.getApplicationContext().getSystemService(Context.LOCATION_SERVICE);
    }

    /**
     * Cheapest provider that can actually answer. The fused provider is the
     * good one and only exists from Android 12; below that, cell and wifi
     * positioning is accurate to well inside the radius a stop is measured
     * in, and costs a fraction of what GPS does. GPS is the last resort, for
     * devices with location services but no network provider.
     */
    private static String provider(LocationManager lm) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return LocationManager.FUSED_PROVIDER;
        }
        if (lm.getAllProviders().contains(LocationManager.NETWORK_PROVIDER)) {
            return LocationManager.NETWORK_PROVIDER;
        }
        if (lm.getAllProviders().contains(LocationManager.GPS_PROVIDER)) {
            return LocationManager.GPS_PROVIDER;
        }
        return null;
    }

    private static PendingIntent pendingIntent(Context ctx) {
        Intent intent = new Intent(ctx.getApplicationContext(), VisitReceiver.class).setAction(ACTION);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // The system writes the location into the intent's extras, so it
            // must be allowed to change it.
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        return PendingIntent.getBroadcast(ctx.getApplicationContext(), 0, intent, flags);
    }

    // ------------------------------------------------- the stop detector

    /**
     * One fix at a time, with everything that has to be remembered written
     * straight back to disk — this runs in a BroadcastReceiver, in a process
     * that may exist for no other reason and may not exist a second later.
     *
     * An anchor is the place currently being sat in. Fixes near it extend
     * the stay; the first fix far enough away ends it. A stay long enough to
     * count is written out as soon as it qualifies, with no departure time
     * yet, and rewritten under the same key when the departure is known —
     * the same two-stage report iOS gives, so a trip in progress shows the
     * place you are at now rather than only the places you have left.
     */
    public static void onLocation(Context ctx, Location fix) {
        if (fix == null || !isEnabled(ctx)) return;

        SharedPreferences p = prefs(ctx);
        double anchorLat = Double.longBitsToDouble(p.getLong(ANCHOR_LAT, 0L));
        double anchorLon = Double.longBitsToDouble(p.getLong(ANCHOR_LON, 0L));
        long first = p.getLong(ANCHOR_FIRST, 0L);
        long last = p.getLong(ANCHOR_LAST, 0L);
        float acc = p.getFloat(ANCHOR_ACC, -1f);
        long now = fix.getTime() > 0 ? fix.getTime() : System.currentTimeMillis();

        if (first == 0L) {
            setAnchor(ctx, fix, now);
            return;
        }

        float[] result = new float[1];
        Location.distanceBetween(anchorLat, anchorLon, fix.getLatitude(), fix.getLongitude(), result);

        if (result[0] <= STAY_RADIUS_M) {
            p.edit()
                .putLong(ANCHOR_LAST, Math.max(last, now))
                // The best accuracy seen while sitting here, which is what
                // the row is eventually stored with.
                .putFloat(ANCHOR_ACC, acc < 0 || (fix.hasAccuracy() && fix.getAccuracy() < acc) ? fix.getAccuracy() : acc)
                .apply();
            if (Math.max(last, now) - first >= MIN_STAY_MS) {
                record(ctx, anchorLat, anchorLon, acc, first, 0L);
            }
            return;
        }

        if (last - first >= MIN_STAY_MS) {
            record(ctx, anchorLat, anchorLon, acc, first, last);
        }
        setAnchor(ctx, fix, now);
    }

    private static void setAnchor(Context ctx, Location fix, long now) {
        prefs(ctx).edit()
            .putLong(ANCHOR_LAT, Double.doubleToRawLongBits(fix.getLatitude()))
            .putLong(ANCHOR_LON, Double.doubleToRawLongBits(fix.getLongitude()))
            .putFloat(ANCHOR_ACC, fix.hasAccuracy() ? fix.getAccuracy() : -1f)
            .putLong(ANCHOR_FIRST, now)
            .putLong(ANCHOR_LAST, now)
            .apply();
    }

    private static void clearAnchor(Context ctx) {
        prefs(ctx).edit()
            .remove(ANCHOR_LAT).remove(ANCHOR_LON).remove(ANCHOR_ACC)
            .remove(ANCHOR_FIRST).remove(ANCHOR_LAST)
            .apply();
    }

    // -------------------------------------------------------- the buffer

    /**
     * Keyed on the arrival, to five decimal places of position — the same
     * key iOS builds, because both end up in the same table and the upsert
     * has to see a re-reported stop as the stop it already has rather than a
     * second place you never went.
     */
    private static void record(Context ctx, double lat, double lon, float accuracy, long arrived, long departed) {
        try {
            String key = String.format(Locale.US, "%.5f,%.5f@%s", lat, lon, iso(arrived));
            JSONArray rows = buffered(ctx);
            JSONArray kept = new JSONArray();
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row != null && !key.equals(row.optString("key"))) kept.put(row);
            }

            JSONObject row = new JSONObject();
            row.put("key", key);
            row.put("lat", lat);
            row.put("lng", lon);
            if (accuracy >= 0) row.put("accuracy", accuracy);
            row.put("arrivedAt", iso(arrived));
            if (departed > 0) row.put("departedAt", iso(departed));
            row.put("recordedAt", iso(System.currentTimeMillis()));
            kept.put(row);

            // Oldest first out, once there are more than anyone will ever
            // upload in one go.
            JSONArray trimmed = new JSONArray();
            int from = Math.max(0, kept.length() - MAX_BUFFERED);
            for (int i = from; i < kept.length(); i++) trimmed.put(kept.get(i));

            prefs(ctx).edit().putString(KEY_BUFFER, trimmed.toString()).apply();
        } catch (Exception ignored) {
            // A visit that cannot be written down is not worth crashing a
            // background broadcast over.
        }
    }

    public static JSONArray buffered(Context ctx) {
        try {
            return new JSONArray(prefs(ctx).getString(KEY_BUFFER, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    /**
     * Drops the visits the web layer has confirmed it stored. Anything that
     * arrived while that upload was in flight is left where it is.
     */
    public static void drop(Context ctx, Set<String> keys) {
        JSONArray rows = buffered(ctx);
        JSONArray kept = new JSONArray();
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row != null && !keys.contains(row.optString("key"))) kept.put(row);
        }
        prefs(ctx).edit().putString(KEY_BUFFER, kept.toString()).apply();
    }

    public static List<JSONObject> bufferedList(Context ctx) {
        JSONArray rows = buffered(ctx);
        List<JSONObject> out = new ArrayList<>();
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row != null) out.add(row);
        }
        return out;
    }

    private static String iso(long ms) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date(ms));
    }
}
