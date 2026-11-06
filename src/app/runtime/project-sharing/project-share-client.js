import { serverRequest } from '../cli/cli-server-bridge.js';

// What the page asks of the database to share a project (supabase/migrations/20261106010000_add_project_members.sql, docs/superpowers/specs/2026-11-06-project-sharing-design.md). Every call
// resolves { ok: true, data } or { ok: false, code }; the code is one of the words the database raises (`not_allowed`, `invite_removed`, ...) or `failed`.

const CODES = ['stale', 'invalid_email', 'rate_limited', 'mail', 'project_not_found', 'not_a_member', 'not_allowed', 'not_shared', 'invalid_role', 'invite_invalid', 'invite_removed', 'invite_full', 'invite_owner', 'invite_email_mismatch'];

/** The word of the database in an error of a call, or 'failed'. */
export function codeOfError(error) {
  const message = String(error?.message || error || '');
  return CODES.find((code) => message.includes(code)) || 'failed';
}

export function createProjectShareClient({ getSupabase, request = serverRequest }) {
  async function call(name, args = {}) {
    let supabase = null;
    try { supabase = getSupabase(); } catch { supabase = null; }
    if (!supabase) return { ok: false, code: 'no_cloud' };
    try {
      const { data, error } = await supabase.rpc(name, args);
      if (error) return { ok: false, code: codeOfError(error) };
      return { ok: true, data };
    } catch (error) {
      return { ok: false, code: codeOfError(error) };
    }
  }
  return {
    preview: (projectId) => call('project_share_preview', { p_project_id: projectId }),
    share: (projectId) => call('share_project', { p_project_id: projectId }),
    members: (projectId) => call('list_project_members', { p_project_id: projectId }),
    links: (projectId) => call('get_project_links', { p_project_id: projectId }),
    makeLink: (projectId, role, name = '') => call('create_project_link', { p_project_id: projectId, p_role: role, p_inviter_name: name }),
    refreshLink: (projectId, role, name = '') => call('refresh_project_link', { p_project_id: projectId, p_role: role, p_inviter_name: name }),
    closeLink: (projectId, role) => call('close_project_link', { p_project_id: projectId, p_role: role }),
    invite: (code) => call('get_project_invite', { p_code: code }),
    accept: (code) => call('accept_project_invite', { p_code: code }),
    setRole: (projectId, memberId, role) => call('set_project_member_role', { p_project_id: projectId, p_member_id: memberId, p_role: role }),
    remove: (projectId, memberId) => call('remove_project_member', { p_project_id: projectId, p_member_id: memberId }),
    /** The owner takes the conversation of another member out of the project (it goes back to the history of its author; nothing is deleted). */
    moveOut: (projectId, conversationId) => call('move_conversation_out_of_project', { p_project_id: projectId, p_conversation_id: conversationId }),
    /** The conversations of this person that were taken out of a project (by its owner, or because they were removed), for the page to forget the link it still holds. */
    exits: () => call('list_my_project_exits'),
    leave: (projectId) => call('leave_project', { p_project_id: projectId }),
    sharedWithMe: () => call('list_shared_with_me'),
    mine: () => call('list_my_shared_projects'),
    updateProject: (projectId, { instructions = null, sources = null, expected = null, name = null, icon = null, color = null, textColor = null }) => call('update_shared_project', { p_project_id: projectId, p_instructions: instructions, p_sources: sources, p_expected: expected, p_name: name, p_icon: icon, p_color: color, p_text_color: textColor }),
    invites: (projectId) => call('list_project_invites', { p_project_id: projectId }),
    revokeInvite: (projectId, inviteId) => call('revoke_project_invite', { p_project_id: projectId, p_invite_id: inviteId }),
    /** The mail goes out from the server (20 an hour for each person): { ok: true, data: { remaining, limit } } or { ok: false, code, remaining? }. */
    async inviteByMail(projectId, { email, role, inviterName = '' }) {
      try {
        const result = await request('POST', `/v1/projects/${projectId}/invite-email`, { body: JSON.stringify({ email, role, inviterName }) });
        if (result?.ok) return { ok: true, data: result.data?.invite || {} };
        const reason = result?.data?.error?.reason || '';
        if (result?.status === 429 || reason === 'rate_limited') return { ok: false, code: 'rate_limited', remaining: 0 };
        return { ok: false, code: ['invalid_email', 'invalid_role', 'not_allowed', 'not_shared', 'invite_full', 'mail'].includes(reason) ? reason : 'failed' };
      } catch { return { ok: false, code: 'failed' }; }
    },
    /**
     * Before a member leaves, or is taken out, the project may keep what they made in it: the server copies the conversations (and their files) to the owner. `memberId` is the person who leaves (the one
     * who asks) or the one the owner takes out. { ok: true, data: { conversations, files: { copied, skipped } } } or { ok: false, code: 'forbidden' | 'failed' }.
     */
    async keepConversations(projectId, memberId = '') {
      try {
        const result = await request('POST', `/v1/projects/${projectId}/keep-conversations`, { body: JSON.stringify(memberId ? { memberId } : {}) });
        if (result?.ok) return { ok: true, data: result.data || {} };
        return { ok: false, code: result?.status === 404 ? 'forbidden' : 'failed' };
      } catch { return { ok: false, code: 'failed' }; }
    },
    async inviteQuota() {
      try { const result = await request('GET', '/v1/project-invite-quota'); return result?.ok ? { ok: true, data: result.data } : { ok: false, code: 'failed' }; } catch { return { ok: false, code: 'failed' }; }
    }
  };
}
