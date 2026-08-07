package app.eend.pond;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * A thin JS window onto {@link VisitTracker}, method for method identical to
 * the iOS plugin — same names, same return shapes, same five authorization
 * strings — so `src/lib/visits.js` needs no idea which platform it is on.
 *
 * Everything that has to survive the app being killed lives in VisitTracker
 * and on disk, not here.
 */
@CapacitorPlugin(
    name = "VisitTracker",
    permissions = {
        @Permission(
            alias = VisitTrackerPlugin.FOREGROUND,
            strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }
        ),
        @Permission(
            alias = VisitTrackerPlugin.BACKGROUND,
            strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }
        )
    }
)
public class VisitTrackerPlugin extends Plugin {

    static final String FOREGROUND = "location";
    static final String BACKGROUND = "background";

    /**
     * Called when the bridge starts, which is every launch — including the
     * ones Android performs to deliver a broadcast. A PendingIntent location
     * request does not survive a process being killed for good, so it is
     * re-made rather than assumed.
     */
    @Override
    public void load() {
        VisitTracker.resumeIfEnabled(getContext());
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject out = new JSObject();
        out.put("enabled", VisitTracker.isEnabled(getContext()));
        out.put("authorization", VisitTracker.authorization(getContext()));
        out.put("pending", VisitTracker.buffered(getContext()).length());
        call.resolve(out);
    }

    /**
     * Android asks in two goes and will not be talked out of it: foreground
     * first, and only once that is granted may background be requested at
     * all. From Android 11 the second request doesn't even show a dialog —
     * the system sends people to Settings — which is why `settings()` below
     * exists and why the copy on the way in says so.
     */
    @PluginMethod
    public void request(PluginCall call) {
        VisitTracker.markAsked(getContext());
        if ("always".equals(VisitTracker.authorization(getContext()))) {
            resolveAuthorization(call);
            return;
        }
        if (getPermissionState(FOREGROUND) != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias(FOREGROUND, call, "afterForeground");
            return;
        }
        requestBackgroundOrFinish(call);
    }

    @PermissionCallback
    private void afterForeground(PluginCall call) {
        VisitTracker.markAsked(getContext());
        if (getPermissionState(FOREGROUND) != com.getcapacitor.PermissionState.GRANTED) {
            resolveAuthorization(call);
            return;
        }
        requestBackgroundOrFinish(call);
    }

    @PermissionCallback
    private void afterBackground(PluginCall call) {
        VisitTracker.markAsked(getContext());
        resolveAuthorization(call);
    }

    private void requestBackgroundOrFinish(PluginCall call) {
        // Before Android 10 there is no such permission and foreground
        // access already covers the background case.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            || getPermissionState(BACKGROUND) == com.getcapacitor.PermissionState.GRANTED) {
            resolveAuthorization(call);
            return;
        }
        requestPermissionForAlias(BACKGROUND, call, "afterBackground");
    }

    private void resolveAuthorization(PluginCall call) {
        JSObject out = new JSObject();
        out.put("authorization", VisitTracker.authorization(getContext()));
        call.resolve(out);
    }

    /** The app's own settings page, where "Allow all the time" actually lives. */
    @PluginMethod
    public void settings(PluginCall call) {
        Intent intent = new Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.fromParts("package", getContext().getPackageName(), null)
        );
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void start(PluginCall call) {
        VisitTracker.start(getContext());
        JSObject out = new JSObject();
        out.put("enabled", true);
        out.put("authorization", VisitTracker.authorization(getContext()));
        call.resolve(out);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        VisitTracker.stop(getContext());
        JSObject out = new JSObject();
        out.put("enabled", false);
        call.resolve(out);
    }

    @PluginMethod
    public void pending(PluginCall call) {
        JSArray visits = new JSArray();
        for (JSONObject row : VisitTracker.bufferedList(getContext())) {
            try {
                visits.put(JSObject.fromJSONObject(row));
            } catch (Exception ignored) {
                // A row that won't convert is one visit, not the upload.
            }
        }
        JSObject out = new JSObject();
        out.put("visits", visits);
        call.resolve(out);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        Set<String> keys = new HashSet<>();
        JSArray given = call.getArray("keys");
        if (given != null) {
            for (int i = 0; i < given.length(); i++) {
                String key = given.optString(i, null);
                if (key != null) keys.add(key);
            }
        }
        VisitTracker.drop(getContext(), keys);
        JSObject out = new JSObject();
        out.put("pending", VisitTracker.buffered(getContext()).length());
        call.resolve(out);
    }
}
