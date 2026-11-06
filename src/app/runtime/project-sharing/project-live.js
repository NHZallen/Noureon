// The live ping of a shared project (supabase/migrations/20261106050000_add_project_live_updates.sql): the database sends `{ c: <conversation or null> }` on the private Realtime channel
// `project:<id>` when anything in the project changes. The page that has the project open hears it and reads what changed through the server; the ping holds no words. While the channel is joined
// the page reads on its own timer only now and then (a ping can be lost: a sleeping tab, a dropped connection); while it is not, the page reads every few seconds as before.

/** `onPing()` is called for each ping, `onState(joined)` when the channel is joined or lost. Returns { stop() }. */
export function subscribeProjectLive({ getSupabase, projectId, onPing = () => {}, onState = () => {} }) {
  let channel = null;
  let stopped = false;
  void (async () => {
    try {
      const client = getSupabase();
      if (!client?.channel) { onState(false); return; }
      try { await client.realtime?.setAuth?.(); } catch { /* the client uses the session it has */ }
      if (stopped) return;
      channel = client.channel(`project:${projectId}`, { config: { private: true } });
      channel.on('broadcast', { event: 'changed' }, () => { if (!stopped) onPing(); });
      channel.subscribe((status) => { if (!stopped) onState(status === 'SUBSCRIBED'); });
    } catch {
      onState(false);
    }
  })();
  return {
    stop() {
      stopped = true;
      try { if (channel) getSupabase()?.removeChannel?.(channel); } catch { /* it closes with the page */ }
      channel = null;
    }
  };
}
