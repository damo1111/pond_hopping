package app.eend.pond;

import android.os.Bundle;
import android.view.View;
import android.view.ViewParent;

import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Fill the screen — or at least look like it.
     *
     * Capacitor 8's SystemBars plugin pads the WebView's parent by the system
     * bar insets unless the device's WebView is version 140 or newer, because
     * older ones report the CSS safe area wrongly. That reserved space had
     * nothing painting it, so the window's default light grey showed through
     * as a band above the header and below the nav.
     *
     * Setting a background in a layout file does not reach it: BridgeActivity
     * inflates Capacitor's own capacitor_bridge_layout_main, and this module's
     * activity_main.xml is never used. So the view Capacitor pads is coloured
     * here, where there is no doubt about which view that is.
     *
     * On a WebView of 140 or newer none of this is visible — Capacitor passes
     * the insets through, there is no padding, and the WebView genuinely fills
     * the window.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        super.onCreate(savedInstanceState);

        int paper = ContextCompat.getColor(this, R.color.pondPaper);
        getWindow().getDecorView().setBackgroundColor(paper);

        if (getBridge() != null && getBridge().getWebView() != null) {
            View webView = getBridge().getWebView();
            // The WebView itself, in case it paints before the page does.
            webView.setBackgroundColor(paper);
            ViewParent parent = webView.getParent();
            if (parent instanceof View) {
                ((View) parent).setBackgroundColor(paper);
            }
        }
    }
}
