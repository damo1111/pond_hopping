package app.eend.pond;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * A reboot cancels every PendingIntent location request on the device.
 *
 * iOS doesn't need this — visit monitoring is remembered by the system
 * across restarts. Android forgets, silently, and the only symptom is that
 * the switch still says "on" while nothing is ever recorded again. So the
 * request is re-made as soon as the phone comes back up, without the app
 * being opened.
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
            || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            VisitTracker.resumeIfEnabled(context);
        }
    }
}
