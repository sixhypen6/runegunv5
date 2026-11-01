/* =========================================================
   RUNEGUN · Ads — AdMob wrapper (rewarded + interstitial, via Capacitor)
   A thin, defensive shim over @capacitor-community/admob. A complete
   no-op anywhere window.Capacitor.Plugins.AdMob is absent (plain web,
   itch.io, Steam/Electron), so the same source builds for every target.

   Ads are PRELOADED so they show the instant the player asks: init(),
   each run start, and the end of every show re-arm the next ad — a tap
   on "Watch ad" then presents an already-loaded ad immediately instead
   of stalling on a network load. showRewarded() resolves TRUE only when
   the reward is actually earned (never on dismiss/cancel/failure).
   ========================================================= */
"use strict";

const Ads = (() => {
  /* ONE switch for the whole ad setup.
     true  → Google's universal TEST units (always fill test ads, even while your
             AdMob app is "Requires review") + isTesting on.
     false → your real AdMob units (only serve once the app is approved & live) +
             isTesting off.

     Set true for development and the Play "closed testing" track; false for the
     public release build. Getting this wrong is silent and expensive — test units
     earn $0 — so `npm run build:release` ASSERTS this is false and aborts the
     build if it is not. `npm run build:web` prints whichever mode it shipped.
     See the release checklist in README.md. */
  const TESTING = false;

  /* Google's public TEST units — always available, bypass account/app review. */
  const TEST_REWARDED     = "ca-app-pub-3940256099942544/5224354917";
  const TEST_INTERSTITIAL = "ca-app-pub-3940256099942544/1033173712";
  /* Your real AdMob units — used only when TESTING is false. */
  const LIVE_REWARDED     = "ca-app-pub-1455355390395459/9992972875";
  const LIVE_INTERSTITIAL = "ca-app-pub-1455355390395459/9991717260";

  const REWARDED_UNIT     = TESTING ? TEST_REWARDED : LIVE_REWARDED;
  const INTERSTITIAL_UNIT = TESTING ? TEST_INTERSTITIAL : LIVE_INTERSTITIAL;

  /* v8 event strings (legacy onRewarded kept for older plugin majors). */
  const RW_LOADED     = "onRewardedVideoAdLoaded";
  const RW_FAILED     = "onRewardedVideoAdFailedToLoad";
  const RW_SHOWED     = "onRewardedVideoAdShowed";
  const RW_FAILSHOW   = "onRewardedVideoAdFailedToShow";
  const RW_DISMISSED  = "onRewardedVideoAdDismissed";
  const RW_REWARD     = ["onRewardedVideoAdReward", "onRewarded"];
  const IN_LOADED     = "interstitialAdLoaded";
  const IN_FAILED     = "interstitialAdFailedToLoad";
  const IN_DISMISSED  = "interstitialAdDismissed";

  function plugin() {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) || null;
  }
  /* True only inside the native Android shell with the AdMob plugin present AND
     the SDK actually initialized. Gating on initOk matters: continue.js offers the
     WATCH AD button purely on the strength of this, and a plugin that is present
     but failed to initialize can never load an ad — offering it there would strand
     the player in an overlay whose only control stalls for the full watchdog. */
  function available() { return !!plugin() && initOk; }

  let rewardedReadyF = false, rewardedLoading = false;
  let interstitialReadyF = false, interstitialLoading = false;
  let showing = false;

  /* The rewarded promise must ALWAYS settle: continue.js clears its adInFlight
     lock only when it does, and while that lock is set every exit from the death
     overlay (decline, sacrifice souls, hardware back) is disabled. So each phase
     carries its own deadline and rwTimer is handed from one to the next. */
  const LOAD_WATCHDOG_MS = 15000;   // tapped, nothing loaded yet → give up, offer the run back
  const SHOW_WATCHDOG_MS = 90000;   // ad is on screen but never reported back → assume lost

  /* in-flight rewarded-show state */
  let rwEarned = false;       // set by the reward event while an ad is on screen
  let rwResolve = null;       // resolver of the current showRewarded() promise
  let rwShowPending = false;  // tapped before an ad was ready — show as soon as it loads
  let rwTimer = null;         // whichever phase watchdog is currently armed

  function rewardedReady() { return !!plugin() && rewardedReadyF; }
  function isShowing() { return showing; }

  async function addL(AdMob, ev, fn) {
    try { return await AdMob.addListener(ev, fn); } catch (e) { return null; }
  }

  function settleRewarded(val) {
    if (rwTimer) { clearTimeout(rwTimer); rwTimer = null; }
    showing = false;
    rwShowPending = false;
    const r = rwResolve; rwResolve = null;
    if (r) r(val);
    prepareRewarded();   // re-arm the next ad so the following revive is instant too
  }

  function doShowRewarded() {
    const AdMob = plugin();
    if (!AdMob) { settleRewarded(false); return; }
    rwEarned = false;
    rewardedReadyF = false;   // consumed
    /* Hand off from the LOAD deadline to the SHOW deadline at the moment the show
       is issued, not when RW_SHOWED comes back. A load finishing near the old 15s
       mark used to let the load watchdog fire while the ad was already on screen:
       the player watched it through, rwResolve was gone, and the earned reward was
       dropped on the floor — AdMob billed the impression, the player got nothing. */
    if (rwTimer) { clearTimeout(rwTimer); rwTimer = null; }
    /* Backstop: past this point only RW_DISMISSED/RW_FAILSHOW can settle, and both
       are registered via addL, which swallows registration failure. If the ad
       activity is killed under memory pressure without reporting back, the promise
       would never settle and continue.js's adInFlight would latch the overlay shut
       forever. Longer than any rewarded creative, so it only fires when truly lost. */
    rwTimer = setTimeout(() => { if (rwResolve) settleRewarded(rwEarned); }, SHOW_WATCHDOG_MS);
    try { AdMob.showRewardVideoAd().catch(() => {}); }   // Dismissed/FailedToShow settle the promise
    catch (e) { settleRewarded(false); }
  }

  let initOk = false;        // the SDK is up and ads may be requested
  let initInFlight = null;   // in-flight init() promise — collapses concurrent calls

  /* initialize() returns a PROMISE — it rejects (no Play Services, no network, a
     consent failure) rather than throwing, so a synchronous try/catch around it
     caught nothing and its fallback was dead code. Await it, remember whether it
     actually came up, and only preload once it has: firing preload() against an
     uninitialized SDK just fails silently.

     RETRYABLE ON PURPOSE. This used to latch a `initStarted` flag before consent
     was known, so a player who declined at launch and then granted consent from
     the settings privacy-options button got no ads until they restarted the app.
     Now only SUCCESS is sticky (initOk): a consent refusal or an SDK error leaves
     init() callable again, and overlays.js re-runs it after the privacy form. */
  async function init() {
    const AdMob = plugin();
    if (!AdMob || initOk) return;
    if (initInFlight) return initInFlight;   // never double-initialize
    initInFlight = (async () => {
      /* Consent BEFORE the SDK, per Google's documented order: initializing AdMob
         is what starts reading the advertising ID, so it must not happen until UMP
         says this player may be served ads. Outside the EEA/UK this resolves true
         immediately with no form shown. If it resolves false we return without
         initializing — initOk stays false, so available() reports false and the
         WATCH AD button is never offered. */
      if (!(await Consent.gather())) return;
      try {
        await AdMob.initialize({ initializeForTesting: TESTING });
        initOk = true;
      } catch (e) {
        noteCrash("ads.init", e);
        initOk = false;
        return;   // no listeners, no preload — available() now reports false and the
                  // WATCH AD button is never offered, so offerContinue() falls
                  // through to a normal game-over instead of a dead overlay.
      }
      registerListeners(AdMob);
      preload();
    })();
    try { await initInFlight; } finally { initInFlight = null; }
  }

  /* Registered exactly once, on the single successful init — initOk gates re-entry
     and initInFlight collapses concurrent calls, so these cannot stack up. */
  function registerListeners(AdMob) {
    addL(AdMob, RW_LOADED, () => {
      rewardedReadyF = true; rewardedLoading = false;
      if (rwShowPending) { rwShowPending = false; doShowRewarded(); }
    });
    addL(AdMob, RW_FAILED, () => {
      rewardedReadyF = false; rewardedLoading = false;
      if (rwShowPending && rwResolve) settleRewarded(false);   // asked to show, but it won't load
    });
    /* Note: does NOT clear rwTimer — by the time this arrives doShowRewarded has
       already swapped the load deadline for the show backstop, and that backstop
       must stay armed for exactly the window this event opens. */
    addL(AdMob, RW_SHOWED, () => { showing = true; });
    addL(AdMob, RW_FAILSHOW, () => { if (rwResolve) settleRewarded(rwEarned); });
    addL(AdMob, RW_DISMISSED, () => { if (rwResolve) settleRewarded(rwEarned); });
    for (const ev of RW_REWARD) addL(AdMob, ev, () => { rwEarned = true; });

    addL(AdMob, IN_LOADED, () => { interstitialReadyF = true; interstitialLoading = false; });
    addL(AdMob, IN_FAILED, () => { interstitialReadyF = false; interstitialLoading = false; });
    addL(AdMob, IN_DISMISSED, () => { showing = false; prepareInterstitial(); });
  }

  function prepareRewarded() {
    const AdMob = plugin();
    if (!AdMob || rewardedReadyF || rewardedLoading) return;
    rewardedLoading = true;
    AdMob.prepareRewardVideoAd({ adId: REWARDED_UNIT, isTesting: TESTING, immersiveMode: true })
      .then(() => {
        rewardedReadyF = true; rewardedLoading = false;
        if (rwShowPending) { rwShowPending = false; doShowRewarded(); }
      })
      .catch(() => { rewardedLoading = false; });
  }

  function prepareInterstitial() {
    const AdMob = plugin();
    if (!AdMob || interstitialReadyF || interstitialLoading) return;
    interstitialLoading = true;
    AdMob.prepareInterstitial({ adId: INTERSTITIAL_UNIT, isTesting: TESTING, immersiveMode: true })
      .then(() => { interstitialReadyF = true; interstitialLoading = false; })
      .catch(() => { interstitialLoading = false; });
  }

  /* Pre-load both formats. Idempotent; no-op off the native shell or when already armed. */
  function preload() { prepareRewarded(); prepareInterstitial(); }

  /* Show a rewarded ad. Resolves TRUE only on a verified reward. Never rejects.
     Shows instantly when preloaded; otherwise loads then auto-shows, bailing
     false after a watchdog window if nothing ever loads (e.g. no fill). */
  function showRewarded() {
    const AdMob = plugin();
    if (!AdMob) return Promise.resolve(false);
    if (rwResolve) return Promise.resolve(false);   // a show is already in flight
    return new Promise((resolve) => {
      rwResolve = resolve;
      rwEarned = false;
      /* Load-phase deadline only. doShowRewarded() replaces it with the show-phase
         backstop the instant it hands control to the native ad activity. */
      rwTimer = setTimeout(() => { if (rwResolve) settleRewarded(false); }, LOAD_WATCHDOG_MS);
      /* The executor is wrapped so this function can HONOUR its "never rejects"
         contract structurally instead of by convention: prepareRewarded() reaches
         straight into the plugin, and a synchronous throw there (missing method on
         a renamed plugin major, bridge error) would otherwise reject the promise —
         and continue.js releases its overlay lock only on the resolve path. */
      try {
        if (rewardedReadyF) {
          doShowRewarded();
        } else {
          rwShowPending = true;
          prepareRewarded();
        }
      } catch (e) {
        noteCrash("ads.showRewarded", e);
        settleRewarded(false);
      }
    });
  }

  /* Show one interstitial. Fire-and-forget; resolves true if it showed. Shows
     instantly when preloaded, else loads then shows. Re-arms the next one. */
  function showInterstitial() {
    const AdMob = plugin();
    if (!AdMob) return Promise.resolve(false);
    return (async () => {
      try {
        if (!interstitialReadyF) {
          await AdMob.prepareInterstitial({ adId: INTERSTITIAL_UNIT, isTesting: TESTING, immersiveMode: true });
        }
        interstitialReadyF = false;
        showing = true;
        await AdMob.showInterstitial();
        prepareInterstitial();   // re-arm (also re-armed by the Dismissed listener)
        return true;
      } catch (e) { showing = false; return false; }
    })();
  }

  return { available, init, preload, rewardedReady, isShowing, showRewarded, showInterstitial };
})();

/* Initialize the SDK and pre-load the first ads at startup (no-op off the native shell). */
Ads.init();
