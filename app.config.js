const appJson = require("./app.json");

const expo = JSON.parse(JSON.stringify(appJson.expo));
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

expo.ios = expo.ios || {};
expo.ios.deploymentTarget = expo.ios.deploymentTarget || "15.0";

if (isProductionBuild) {
  expo.ios.infoPlist = expo.ios.infoPlist || {};
  expo.ios.infoPlist.NSAppTransportSecurity = {
    ...(expo.ios.infoPlist.NSAppTransportSecurity || {}),
    NSAllowsArbitraryLoads: false,
  };
}

module.exports = { expo };
