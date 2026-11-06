// What the page asks of the database to share a project (supabase/migrations/20261106010000_add_project_members.sql, docs/superpowers/specs/2026-11-06-project-sharing-design.md). Every call
// resolves { ok: true, data } or { ok: false, code }; the code is one of the words the database raises (`not_allowed`, `invite_removed`, ...) or `failed`.

const CODES = ['project_not_found', 'not_a_member', 'not_allowed', 'not_shared', 'invalid_role', 'invite_invalid', 'invite_removed', 'invite_full', 'invite_owner', 'invite_email_mismatch'];

/** The word of the database in an error of a call, or 'failed'. */
export function codeOfError(error) {
  const message = String(error?.message || error || '');
  return CODES.find((code) => message.includes(code)) || 'failed';
}

export function createProjectShareClient({ getSupabase }) {
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
    leave: (projectId) => call('leave_project', { p_project_id: projectId }),
    sharedWithMe: () => call('list_shared_with_me')
  };
}
