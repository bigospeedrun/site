// GA4 for Big O Speedrun. Production hosts only; advertising features are disabled.
(function () {
  if (
    location.hostname !== "bigospeedrun.com" &&
    location.hostname !== "www.bigospeedrun.com"
  ) {
    return;
  }

  var MEASUREMENT_ID = "G-MZ689LR3LG";

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, {
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  var tag = document.createElement("script");
  tag.async = true;
  tag.src = "https://www.googletagmanager.com/gtag/js?id=" + MEASUREMENT_ID;
  document.head.appendChild(tag);
})();
