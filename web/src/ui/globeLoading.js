// The stage says "Loading" while a NASA frame is on its way, so the black is never unexplained.
export function trackLoading(container) {
  const stage = container.closest('.stage');
  let pending = 0;
  return {
    start() { pending += 1; if (stage) stage.dataset.loading = 'true'; },
    end() { pending = Math.max(0, pending - 1); if (!pending && stage) delete stage.dataset.loading; },
  };
}
