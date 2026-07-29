export function createHistoryRecallRuntime({
  consent,
  retrieval,
  ensureIndexReady,
  ensureConsentReady,
  ensureDerivedReady,
  getIndexStatus
} = {}) {
  return {
    async retrieve(options) {
      await Promise.all([ensureIndexReady(), ensureConsentReady(), ensureDerivedReady()]);
      return consent.isGranted() ? retrieval.retrieve(options) : [];
    },
    grant: () => consent.grant(),
    revoke: () => consent.revoke(),
    getStatus() {
      void ensureIndexReady();
      void ensureConsentReady();
      return {
        consented: consent.isGranted(),
        consentLoaded: consent.isLoaded(),
        ...getIndexStatus()
      };
    }
  };
}
