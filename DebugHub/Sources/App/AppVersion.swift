import Foundation

enum AppVersion {
  static let current: String = {
    if let envValue = ProcessInfo.processInfo.environment["DEBUGHUB_VERSION"],
      !envValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      return envValue
    }
    return "1.2.5"
  }()
}
