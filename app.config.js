const expo = {
  name: "ValueVision",
  slug: "ValueVision",
  version: "1.0.1",
  icon: "./assets/images/icon.png",
  scheme: "valuevision",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    icon: "./assets/images/icon.png",
    bundleIdentifier: "com.abbiemaytum.valuevision",
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription: "ValueVision uses the camera to scan items like cards, coins, collectibles, tools, and tech for valuation.",
      NSPhotoLibraryUsageDescription: "ValueVision lets you choose item photos for valuation and resale guidance.",
      NSMicrophoneUsageDescription: "ValueVision uses the microphone for optional voice notes while scanning.",
      ITSAppUsesNonExemptEncryption: false,
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
      },
    },
  },
  android: {
    package: "com.abbiemaytum.valuevision",
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
  },
  web: {
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
    "expo-web-browser",
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: "fa373526-256a-4166-a5b3-2f11e0dc9207",
    },
  },
};
const isProductionBuild =
  process.env.EAS_BUILD_PROFILE === "production" || process.env.APP_ENV === "production";
const publicApiBase = String(process.env.EXPO_PUBLIC_API_BASE || "").trim();

if (publicApiBase) {
  expo.extra = expo.extra || {};
  expo.extra.apiBase = publicApiBase.replace(/\/+$/, "");
}

expo.plugins = expo.plugins || [];
const hasExpoIapPlugin = expo.plugins.some((plugin) => {
  if (Array.isArray(plugin)) return plugin[0] === "expo-iap";
  return plugin === "expo-iap";
});
if (!hasExpoIapPlugin) {
  expo.plugins.push("expo-iap");
}

if (isProductionBuild) {
  expo.ios.infoPlist = expo.ios.infoPlist || {};
  expo.ios.infoPlist.NSAppTransportSecurity = {
    ...(expo.ios.infoPlist.NSAppTransportSecurity || {}),
    NSAllowsArbitraryLoads: false,
  };
}

module.exports = { expo };
