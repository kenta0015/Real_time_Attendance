// app.config.js (FULL)
export default ({ config }) => {
  const env = process.env.APP_ENV ?? "internal"; // "internal" | "production"
  const isProd = env === "production";

  return {
    // ---- base ----
    ...config,
    owner: "kenta0015",
    name: isProd ? "GeoAttendance" : "GeoAttendance (Test)",
    slug: "geoattendance",
    scheme: "rta",
    orientation: "portrait",
    platforms: ["android", "ios"],
    version: "1.0.0",

    runtimeVersion: { policy: "appVersion" },
    updates: {
      url: "https://u.expo.dev/18a62c09-a52c-4ff1-93eb-c86674e29bd9"
    },

    extra: {
      appEnv: env,
      eas: { projectId: "18a62c09-a52c-4ff1-93eb-c86674e29bd9" }
    },

    plugins: [
      "expo-router",
      "expo-camera",
      "expo-notifications",
      "expo-mail-composer"
    ],

    // ---- Android ----
    android: {
      package: isProd
        ? "com.kenta0015.geoattendance"
        : "com.kenta0015.geoattendance.internal",
      versionCode: 2,
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "FOREGROUND_SERVICE",
        "POST_NOTIFICATIONS",
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO"
      ],
      foregroundService: {
        type: "location"
      }
    },

    // ---- iOS ----
    ios: {
      bundleIdentifier: isProd
        ? "com.kenta0015.geoattendance"
        : "com.kenta0015.geoattendance.internal",
      buildNumber: "1",
      supportsTablet: false,
      infoPlist: {
        UIBackgroundModes: ["location", "remote-notification"],
        NSLocationWhenInUseUsageDescription:
          "We use your location to verify on-site attendance.",
        NSLocationAlwaysAndWhenInUseUsageDescription:
          "We use your location in the background to detect venue entry and exit.",
        NSLocationAlwaysUsageDescription:
          "We use your location in the background to detect venue entry and exit."
      }
    },

    // ---- Web ----
    web: { favicon: "./assets/favicon.png" },

    // ---- Branding ----
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    }
  };
};
