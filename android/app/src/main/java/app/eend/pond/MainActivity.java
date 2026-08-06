package app.eend.pond;

import android.os.Bundle;
import android.view.View;
import android.view.ViewParent;
import android.webkit.WebView;

import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

import java.util.Locale;

public class MainActivity extends BridgeActivity {

    /**
     * Actually fill the screen, rather than looking like it.
     *
     * The previous version of this painted the reserved band the app's paper
     * colour so the white stripe stopped showing. That was camouflage. The
     * app was still sitting in a picture frame — the photo on the recap
     * started below the clock and the page ended above the gesture pill.
     *
     * Why it was framed: Capacitor 8's SystemBars plugin puts padding on the
     * WebView's *parent* equal to the system bar insets, and reports the CSS
     * safe area as zero, whenever the device's WebView is older than 140.
     * Older WebViews get env(safe-area-inset-*) wrong, so rather than trust
     * them it insets the view instead. Defensible, and it means the page can
     * never draw under the bars.
     *
     * capacitor.config.json now sets insetsHandling to "disable", which makes
     * the plugin leave the view alone entirely — the WebView fills the window
     * and the app genuinely bleeds edge to edge. The cost is that nobody is
     * publishing the safe area any more, and on the WebViews that made this
     * necessary the browser's own env() values cannot be trusted to do it.
     *
     * So this does it. The listener below reads the real inset values from
     * the window and writes them into the page as the same custom properties
     * Capacitor would have used, so the stylesheet needs no special case:
     * every rule asks for var(--safe-area-inset-top, env(safe-area-inset-top))
     * and gets a true value here, a browser value on iOS and the web.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        super.onCreate(savedInstanceState);

        // Behind the WebView for the frames before the page has painted, and
        // behind the bars, which are transparent.
        int paper = ContextCompat.getColor(this, R.color.pondPaper);
        getWindow().getDecorView().setBackgroundColor(paper);

        if (getBridge() == null || getBridge().getWebView() == null) return;

        final WebView webView = getBridge().getWebView();
        webView.setBackgroundColor(paper);

        ViewParent parent = webView.getParent();
        if (!(parent instanceof View)) return;
        View host = (View) parent;
        host.setBackgroundColor(paper);

        ViewCompat.setOnApplyWindowInsetsListener(host, (v, insets) -> {
            Insets bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean keyboard = insets.isVisible(WindowInsetsCompat.Type.ime());

            // The keyboard is the one inset the page cannot draw under —
            // there is nothing to see behind it. Everything else stays the
            // page's to handle, which is the entire point.
            v.setPadding(0, 0, 0, keyboard ? ime.bottom : 0);

            publishInsets(webView, bars.top, bars.right, keyboard ? 0 : bars.bottom, bars.left);
            return insets;
        });

        // Capacitor also does an initial injection before any inset event
        // arrives, and disabling its handling loses that too. Without this
        // there is a window at startup where the page has no inset values and
        // env() reports zero on exactly the WebViews that made this necessary
        // — so the header would sit under the clock for the first frames.
        ViewCompat.requestApplyInsets(host);
    }

    /**
     * Insets arrive in device pixels; CSS wants density-independent ones.
     * Same property names and the same conversion Capacitor uses, so the two
     * are interchangeable if this ever goes back to the plugin.
     */
    private void publishInsets(final WebView webView, int top, int right, int bottom, int left) {
        float density = getResources().getDisplayMetrics().density;
        final String script = String.format(
            Locale.US,
            "try{var s=document.documentElement.style;" +
            "s.setProperty('--safe-area-inset-top','%dpx');" +
            "s.setProperty('--safe-area-inset-right','%dpx');" +
            "s.setProperty('--safe-area-inset-bottom','%dpx');" +
            "s.setProperty('--safe-area-inset-left','%dpx');}catch(e){}",
            (int) (top / density),
            (int) (right / density),
            (int) (bottom / density),
            (int) (left / density)
        );
        webView.post(() -> webView.evaluateJavascript(script, null));
    }
}
