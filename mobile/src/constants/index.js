// API base URL — points to Docker backend
// On physical device replace localhost with your machine's local IP
export const API_URL = 'http://192.168.1.146:5001/api';
export const SOCKET_URL = 'http://192.168.1.146:5001';

// Settlr brand colours
export const COLORS = {
  primary:     '#6C47FF',  // Settlr purple
  primaryDark: '#4B2FE0',
  success:     '#22C55E',
  warning:     '#F59E0B',
  danger:      '#EF4444',
  dark:        '#111827',
  grey:        '#6B7280',
  lightGrey:   '#F3F4F6',
  white:       '#FFFFFF',
  border:      '#E5E7EB',
};

export const FONTS = {
  regular: 'System',
  bold:    'System',
};

export const SPLIT_STATUS = {
  PENDING:     'pending',
  ACCEPTED:    'accepted',
  PAY_LATER:   'pay_later',
  DECLINED:    'declined',
  NO_RESPONSE: 'no_response',
  SETTLED:     'settled',
};
