package app.eend.pond;

import android.os.Bundle;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Let the WebView draw behind the status and navigation bars.
     *
     * Without this the system insets the window and the app renders in the
     * space left over — a grey band above the header and below the nav, which
     * is what "not bleeding full screen" looked like. The web side has been
     * padding for env(safe-area-inset-*) since the beginning; those values are
     * only non-zero once the window actually owns that space.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        super.onCreate(savedInstanceState);
    }
}
