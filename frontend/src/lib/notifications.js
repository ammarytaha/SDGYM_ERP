// Notification type labels (Phase 5). Mirrors the backend `notification_type` enum.

export const NOTIFICATION_TYPE_LABELS = {
  welcome: 'ترحيب',
  checkin_confirmation: 'تأكيد حضور',
  renewal_reminder: 'تذكير تجديد',
  payment_overdue: 'تنبيه سداد',
};

export function notificationTypeLabel(type) {
  return NOTIFICATION_TYPE_LABELS[type] || type || '—';
}
