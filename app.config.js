const appJson = require("./app.json");

const expo = JSON.parse(JSON.stringify(appJson.expo));
const isProductionBuild =
  process.env.EAS_BUILD_PROFILE === "production" || process.env.APP_ENV === "production";
const publicApiBase = String(process.env.EXPO_PUBLIC_API_BASE || "").trim();

if (publicApiBase) {
  expo.extra = expo.extra || {};
  expo.extra.apiBase = publicApiBase.replace(/\/+$/, "");
}

if (isProductionBuild) {
  expo.ios = expo.ios || {};
  expo.ios.infoPlist = expo.ios.infoPlist || {};
  expo.ios.infoPlist.NSAppTransportSecurity = {
    ...(expo.ios.infoPlist.NSAppTransportSecurity || {}),
    NSAllowsArbitraryLoads: false,
  };
}

module.exports = { expo };
