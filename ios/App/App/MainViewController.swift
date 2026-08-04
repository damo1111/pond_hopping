import UIKit
import Capacitor

/// Exists solely to introduce `VisitTrackerPlugin` to the bridge.
///
/// Capacitor 8 doesn't discover plugins by scanning the Objective-C runtime.
/// `CapacitorBridge.registerPlugins()` reads the class list that `cap sync`
/// writes into capacitor.config.json, and that list only ever names
/// installed npm packages. A plugin living in the app target is invisible to
/// it — no error, no warning, just a JS call that never resolves — so it has
/// to introduce itself here.
///
/// `capacitorDidLoad()` is the hook for it: the bridge exists by then, and
/// the web view hasn't started loading.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(VisitTrackerPlugin())
    }
}
