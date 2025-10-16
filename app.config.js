// app.config.js
export default ({ config }) => {
  const env = process.env.APP_ENV ?? "internal"; // "internal" | "production"
  const isProd = env === "production";

  return {
    ...config,
    owner: "kenta0015",
    name: isProd ? "GeoAttendance" : "GeoAttendance (Test)",
    slug: "geoattendance",
    scheme: "rta",
    orientation: "portrait",
    platforms: ["android", "ios"],
    version: "1.0.0",

    plugins: ["expo-router"],

    extra: {
      appEnv: env,
      eas: {
        projectId: "18a62c09-a52c-4ff1-93eb-c86674e29bd9"
      }
    },

    android: {
      package: isProd
        ? "com.kenta0015.geoattendance"
        : "com.kenta0015.geoattendance.internal",
      versionCode: 1
    },

    ios: {
      bundleIdentifier: isProd
        ? "com.kenta0015.geoattendance"
        : "com.kenta0015.geoattendance.internal",
      buildNumber: "1"
    }
  };
};
