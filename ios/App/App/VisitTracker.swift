import Foundation
import CoreLocation

/// Visit-based location history.
///
/// `CLVisit` is the API Apple built for exactly the question a travel log
/// asks — "where did you stop, and for how long" — rather than a breadcrumb
/// every few seconds. It costs almost nothing in battery, and unlike
/// continuous updates iOS will relaunch a terminated app to deliver one.
/// That last part is the whole point: the days worth recording are the days
/// you were far too busy to open the app.
///
/// Deliberately *not* a Capacitor plugin. Capacitor instantiates plugins
/// lazily, on the first call from JS, so a plugin-owned location manager
/// wouldn't exist at all on a background relaunch — no delegate, no visit,
/// silently nothing. This is started from `AppDelegate` instead and buffers
/// to disk; the plugin is a thin window onto it for whenever the WebView
/// next wakes up.
final class VisitTracker: NSObject, CLLocationManagerDelegate {
    static let shared = VisitTracker()

    /// Visits are tiny and arrive a handful of times a day, but a phone that
    /// goes months without opening the app shouldn't grow without bound.
    /// Oldest go first — recent movement is the part still worth uploading.
    private let maxBuffered = 500

    private let defaults = UserDefaults.standard
    private let enabledKey = "pond.visits.enabled"
    private let bufferKey = "pond.visits.buffer"

    private lazy var manager: CLLocationManager = {
        let m = CLLocationManager()
        m.delegate = self
        return m
    }()

    /// Resolved once, when the user answers the permission prompt. Set by
    /// the plugin so a JS `request()` can await the real answer instead of
    /// reporting the status from before the dialog appeared.
    var onAuthorizationSettled: ((String) -> Void)?

    private override init() {
        super.init()
    }

    var isEnabled: Bool { defaults.bool(forKey: enabledKey) }

    var authorization: String {
        switch manager.authorizationStatus {
        case .authorizedAlways: return "always"
        case .authorizedWhenInUse: return "whenInUse"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "unknown"
        }
    }

    /// Called on every launch, including the background ones iOS triggers to
    /// hand us a visit. Monitoring itself survives termination on the system
    /// side, but the delegate does not, so it has to be re-attached before
    /// the event can be delivered anywhere.
    func resumeIfEnabled() {
        guard isEnabled else { return }
        manager.startMonitoringVisits()
    }

    func start() {
        defaults.set(true, forKey: enabledKey)
        manager.startMonitoringVisits()
    }

    func stop() {
        defaults.set(false, forKey: enabledKey)
        manager.stopMonitoringVisits()
    }

    func requestAuthorization() {
        // Asking for Always from a standing start still gets the ordinary
        // while-using prompt; iOS decides on its own, later, whether to
        // offer the upgrade. Nothing here can hurry that along.
        manager.requestAlwaysAuthorization()
    }

    // MARK: - Buffer

    func buffered() -> [[String: Any]] {
        defaults.array(forKey: bufferKey) as? [[String: Any]] ?? []
    }

    /// Drops the visits the web layer has confirmed it stored. Anything that
    /// arrived while that upload was in flight is left where it is.
    func drop(keys: Set<String>) {
        let kept = buffered().filter { !keys.contains(($0["key"] as? String) ?? "") }
        defaults.set(kept, forKey: bufferKey)
    }

    // MARK: - CLLocationManagerDelegate

    func locationManager(_ manager: CLLocationManager, didVisit visit: CLVisit) {
        let coord = visit.coordinate
        guard CLLocationCoordinate2DIsValid(coord) else { return }

        // A stop is usually reported twice: once on arrival, with no
        // departure known yet, and again when you leave. Keying on the
        // arrival means the second report replaces the first rather than
        // inventing a second place you never went.
        let arrival = visit.arrivalDate == Date.distantPast ? nil : visit.arrivalDate
        let departure = visit.departureDate == Date.distantFuture ? nil : visit.departureDate

        var arrivalKey = "unknown"
        if let a = arrival { arrivalKey = VisitTracker.iso.string(from: a) }
        let key = String(format: "%.5f,%.5f@%@", coord.latitude, coord.longitude, arrivalKey)

        var row: [String: Any] = [
            "key": key,
            "lat": coord.latitude,
            "lng": coord.longitude,
            "accuracy": visit.horizontalAccuracy,
            "recordedAt": VisitTracker.iso.string(from: Date()),
        ]
        if let a = arrival { row["arrivedAt"] = VisitTracker.iso.string(from: a) }
        if let d = departure { row["departedAt"] = VisitTracker.iso.string(from: d) }

        var rows = buffered().filter { ($0["key"] as? String) != key }
        rows.append(row)
        if rows.count > maxBuffered {
            rows.removeFirst(rows.count - maxBuffered)
        }
        defaults.set(rows, forKey: bufferKey)
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        // This also fires once, with the status unchanged, as soon as the
        // delegate is attached — so only a real answer counts as settled.
        guard manager.authorizationStatus != .notDetermined else { return }
        let callback = onAuthorizationSettled
        onAuthorizationSettled = nil
        callback?(authorization)
    }

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
}
