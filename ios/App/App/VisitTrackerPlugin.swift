import Foundation
import Capacitor

/// A thin JS window onto `VisitTracker`. Everything that has to survive the
/// app being killed lives there, not here — see the note at the top of that
/// file for why the location manager isn't owned by this class.
///
/// Reached from JS as `registerPlugin('VisitTracker')`.
@objc(VisitTrackerPlugin)
public class VisitTrackerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VisitTrackerPlugin"
    public let jsName = "VisitTracker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    @objc func status(_ call: CAPPluginCall) {
        let tracker = VisitTracker.shared
        call.resolve([
            "enabled": tracker.isEnabled,
            "authorization": tracker.authorization,
            "pending": tracker.buffered().count
        ])
    }

    @objc func request(_ call: CAPPluginCall) {
        let tracker = VisitTracker.shared
        guard tracker.authorization == "notDetermined" else {
            call.resolve(["authorization": tracker.authorization])
            return
        }
        // Resolve when the user actually answers — reading the status
        // straight after asking would always report "notDetermined".
        tracker.onAuthorizationSettled = { status in
            call.resolve(["authorization": status])
        }
        tracker.requestAuthorization()
    }

    @objc func start(_ call: CAPPluginCall) {
        VisitTracker.shared.start()
        call.resolve([
            "enabled": true,
            "authorization": VisitTracker.shared.authorization
        ])
    }

    @objc func stop(_ call: CAPPluginCall) {
        VisitTracker.shared.stop()
        call.resolve(["enabled": false])
    }

    @objc func pending(_ call: CAPPluginCall) {
        call.resolve(["visits": VisitTracker.shared.buffered()])
    }

    @objc func clear(_ call: CAPPluginCall) {
        let keys = call.getArray("keys", String.self) ?? []
        VisitTracker.shared.drop(keys: Set(keys))
        call.resolve(["pending": VisitTracker.shared.buffered().count])
    }
}
