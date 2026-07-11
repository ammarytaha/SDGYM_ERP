// Staff role → Arabic label (spec §2/§6). Roles that may create/edit members are
// owner + front_desk; trainer is read-only.

export const ROLE_LABELS = {
  owner: 'المالك',
  front_desk: 'موظف الاستقبال',
  trainer: 'مدرب',
};

// Roles allowed to create/edit members (backend enforces this too; the UI just
// hides controls these roles can't use).
export const MEMBER_MANAGE_ROLES = ['owner', 'front_desk'];

export function canManageMembers(role) {
  return MEMBER_MANAGE_ROLES.includes(role);
}
