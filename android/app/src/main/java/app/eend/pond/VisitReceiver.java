package app.eend.pond;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.location.LocationManager;
import android.os.Bundle;

/**
 * Where a location fix lands when the app isn't running.
 *
 * This is the whole reason the request is made with a PendingIntent rather
 * than a listener: Android will start the process purely to deliver this,
 * which is the equivalent of iOS relaunching the app to hand over a CLVisit.
 * The days worth recording are the days nobody opened the app.
 *
 * It must stay cheap. A BroadcastReceiver gets a few seconds and no
 * guarantee of a second one, so all it does is hand the fix to the detector,
 * which writes what it needs straight to disk.
 */
public class VisitReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        Bundle extras = intent.getExtras();
        if (extras == null) return;

        Object value = extras.get(LocationManager.KEY_LOCATION_CHANGED);
        if (value instanceof Location) {
            VisitTracker.onLocation(context, (Location) value);
            return;
        }

        // Location services being switched off mid-trip isn't an error and
        // isn't a departure — the current stay is simply left open, and the
        // next fix that arrives decides whether it ended.
        if (extras.containsKey(LocationManager.KEY_PROVIDER_ENABLED)) {
            boolean enabled = extras.getBoolean(LocationManager.KEY_PROVIDER_ENABLED, true);
            if (enabled) VisitTracker.resumeIfEnabled(context);
        }
    }
}
