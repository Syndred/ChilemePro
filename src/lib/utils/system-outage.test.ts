import { describe, it, expect } from 'vitest';
import {
  calculateOutageDuration,
  isTimeWithinOutage,
  isTaskDateAffectedByOutage,
  shouldAutoValidateTask,
  shouldNotifyUsers,
  checkOutageRefundEligibility,
  validateAppeal,
  calculateRefundDeadline,
  isRefundOverdue,
  getAppealRefundAmount,
  getAffectedUserIds,
  MAX_APPEAL_REASON_LENGTH,
  MIN_APPEAL_REASON_LENGTH,
} from './system-outage';

// --- calculateOutageDuration ---

describe('calculateOutageDuration', () => {
  it('calculates duration between start and end', () => {
    const start = new Date('2025-06-01T10:00:00');
    const end = new Date('2025-06-01T13:00:00');
    const result = calculateOutageDuration(start, end);
    expect(result.durationHours).toBe(3);
    expect(result.durationMs).toBe(3 * 60 * 60 * 1000);
  });

  it('uses now when end is null (active outage)', () => {
    const start = new Date('2025-06-01T10:00:00');
    const now = new Date('2025-06-01T11:30:00');
    const result = calculateOutageDuration(start, null, now);
    expect(result.durationHours).toBe(1.5);
  });

  it('returns 0 for zero-duration outage', () => {
    const time = new Date('2025-06-01T10:00:00');
    const result = calculateOutageDuration(time, time);
    expect(result.durationMs).toBe(0);
    expect(result.durationHours).toBe(0);
  });

  it('returns 0 when end is before start', () => {
    const start = new Date('2025-06-01T12:00:00');
    const end = new Date('2025-06-01T10:00:00');
    const result = calculateOutageDuration(start, end);
    expect(result.durationMs).toBe(0);
  });

  it('marks exceeds threshold when >= 2 hours', () => {
    const start = new Date('2025-06-01T10:00:00');
    const end = new Date('2025-06-01T12:00:00');
    const result = calculateOutageDuration(start, end);
    expect(result.exceedsNotificationThreshold).toBe(true);
  });

  it('does not exceed threshold when < 2 hours', () => {
    const start = new Date('2025-06-01T10:00:00');
    const end = new Date('2025-06-01T11:59:59');
    const result = calculateOutageDuration(start, end);
    expect(result.exceedsNotificationThreshold).toBe(false);
  });
});

// --- isTimeWithinOutage ---

describe('isTimeWithinOutage', () => {
  it('returns true when time is within outage period', () => {
    const start = new Date('2025-06-01T10:00:00');
    const end = new Date('2025-06-01T14:00:00');
    const time = new Date('2025-06-01T12:00:00');
    expect(isTimeWithinOutage(time, start, end)).toBe(true);
  });

  it('returns true at exact start time', () => {
    const start = new Date('2025-06-01T10:00:00');
    const end = new Date('2025-06-01T14:00:00');
    expect(isTimeWithinOutage(start, start, end)).toBe(true);
  });

  it('returns true at exact end time', () => {
    const start = new Date('2025-06-01T10:00:00');
    const end = new Date('2025-06-01T14:00:00');
    expect(isTimeWithinOutage(end, start, end)).toBe(true);
  });

  it('returns false when time is before outage', () => {
    const start = new Date('2025-06-01T10:00:00');
    const end = new Date('2025-06-01T14:00:00');
    const time = new Date('2025-06-01T09:00:00');
    expect(isTimeWithinOutage(time, start, end)).toBe(false);
  });

  it('returns false when time is after outage', () => {
    const start = new Date('2025-06-01T10:00:00');
    const end = new Date('2025-06-01T14:00:00');
    const time = new Date('2025-06-01T15:00:00');
    expect(isTimeWithinOutage(time, start, end)).toBe(false);
  });

  it('returns true for any future time when outage has no end (active)', () => {
    const start = new Date('2025-06-01T10:00:00');
    const time = new Date('2025-12-31T23:59:59');
    expect(isTimeWithinOutage(time, start, null)).toBe(true);
  });
});

// --- isTaskDateAffectedByOutage ---

describe('isTaskDateAffectedByOutage', () => {
  it('returns true when outage overlaps with task date', () => {
    const taskDate = new Date('2025-06-05');
    const outageStart = new Date('2025-06-05T08:00:00');
    const outageEnd = new Date('2025-06-05T12:00:00');
    expect(isTaskDateAffectedByOutage(taskDate, outageStart, outageEnd)).toBe(true);
  });

  it('returns true when outage spans multiple days including task date', () => {
    const taskDate = new Date('2025-06-05');
    const outageStart = new Date('2025-06-04T20:00:00');
    const outageEnd = new Date('2025-06-06T08:00:00');
    expect(isTaskDateAffectedByOutage(taskDate, outageStart, outageEnd)).toBe(true);
  });

  it('returns false when outage is entirely before task date', () => {
    const taskDate = new Date('2025-06-05');
    const outageStart = new Date('2025-06-03T10:00:00');
    const outageEnd = new Date('2025-06-04T10:00:00');
    expect(isTaskDateAffectedByOutage(taskDate, outageStart, outageEnd)).toBe(false);
  });

  it('returns false when outage is entirely after task date', () => {
    const taskDate = new Date('2025-06-05');
    const outageStart = new Date('2025-06-06T10:00:00');
    const outageEnd = new Date('2025-06-07T10:00:00');
    expect(isTaskDateAffectedByOutage(taskDate, outageStart, outageEnd)).toBe(false);
  });

  it('returns true when outage has no end and starts before task date', () => {
    const taskDate = new Date('2025-06-05');
    const outageStart = new Date('2025-06-04T10:00:00');
    expect(isTaskDateAffectedByOutage(taskDate, outageStart, null)).toBe(true);
  });

  it('returns true when outage starts at end of task day', () => {
    const taskDate = new Date('2025-06-05');
    const outageStart = new Date('2025-06-05T23:00:00');
    const outageEnd = new Date('2025-06-06T02:00:00');
    expect(isTaskDateAffectedByOutage(taskDate, outageStart, outageEnd)).toBe(true);
  });
});

// --- shouldAutoValidateTask ---

describe('shouldAutoValidateTask', () => {
  it('auto-validates uncompleted task affected by outage', () => {
    const taskDate = new Date('2025-06-05');
    const outages = [
      { startTime: new Date('2025-06-05T08:00:00'), endTime: new Date('2025-06-05T12:00:00'), id: 'outage-1' },
    ];
    const result = shouldAutoValidateTask(taskDate, false, outages);
    expect(result.shouldAutoValidate).toBe(true);
    expect(result.isAffectedByOutage).toBe(true);
    expect(result.outageId).toBe('outage-1');
  });

  it('does not auto-validate already completed task', () => {
    const taskDate = new Date('2025-06-05');
    const outages = [
      { startTime: new Date('2025-06-05T08:00:00'), endTime: new Date('2025-06-05T12:00:00'), id: 'outage-1' },
    ];
    const result = shouldAutoValidateTask(taskDate, true, outages);
    expect(result.shouldAutoValidate).toBe(false);
  });

  it('does not auto-validate when no outage affects the task', () => {
    const taskDate = new Date('2025-06-05');
    const outages = [
      { startTime: new Date('2025-06-03T08:00:00'), endTime: new Date('2025-06-03T12:00:00'), id: 'outage-1' },
    ];
    const result = shouldAutoValidateTask(taskDate, false, outages);
    expect(result.shouldAutoValidate).toBe(false);
    expect(result.isAffectedByOutage).toBe(false);
  });

  it('handles empty outages list', () => {
    const result = shouldAutoValidateTask(new Date('2025-06-05'), false, []);
    expect(result.shouldAutoValidate).toBe(false);
  });

  it('picks the first matching outage', () => {
    const taskDate = new Date('2025-06-05');
    const outages = [
      { startTime: new Date('2025-06-05T08:00:00'), endTime: new Date('2025-06-05T10:00:00'), id: 'outage-1' },
      { startTime: new Date('2025-06-05T14:00:00'), endTime: new Date('2025-06-05T16:00:00'), id: 'outage-2' },
    ];
    const result = shouldAutoValidateTask(taskDate, false, outages);
    expect(result.outageId).toBe('outage-1');
  });
});

// --- shouldNotifyUsers ---

describe('shouldNotifyUsers', () => {
  it('returns true when outage exceeds 2 hours', () => {
    const start = new Date('2025-06-01T10:00:00');
    const end = new Date('2025-06-01T12:30:00');
    expect(shouldNotifyUsers(start, end)).toBe(true);
  });

  it('returns true at exactly 2 hours', () => {
    const start = new Date('2025-06-01T10:00:00');
    const end = new Date('2025-06-01T12:00:00');
    expect(shouldNotifyUsers(start, end)).toBe(true);
  });

  it('returns false when outage is less than 2 hours', () => {
    const start = new Date('2025-06-01T10:00:00');
    const end = new Date('2025-06-01T11:30:00');
    expect(shouldNotifyUsers(start, end)).toBe(false);
  });

  it('uses now for active outage (null end)', () => {
    const start = new Date('2025-06-01T10:00:00');
    const now = new Date('2025-06-01T13:00:00');
    expect(shouldNotifyUsers(start, null, now)).toBe(true);
  });

  it('returns false for active outage under 2 hours', () => {
    const start = new Date('2025-06-01T10:00:00');
    const now = new Date('2025-06-01T11:00:00');
    expect(shouldNotifyUsers(start, null, now)).toBe(false);
  });
});

// --- checkOutageRefundEligibility ---

describe('checkOutageRefundEligibility', () => {
  const outages = [
    { startTime: new Date('2025-06-05T08:00:00'), endTime: new Date('2025-06-05T14:00:00') },
  ];

  it('grants full refund for failed challenge affected by outage', () => {
    const taskDates = [new Date('2025-06-05'), new Date('2025-06-06')];
    const result = checkOutageRefundEligibility('failed', 100, taskDates, outages);
    expect(result.eligible).toBe(true);
    expect(result.refundAmount).toBe(100);
  });

  it('denies refund for active challenge', () => {
    const taskDates = [new Date('2025-06-05')];
    const result = checkOutageRefundEligibility('active', 100, taskDates, outages);
    expect(result.eligible).toBe(false);
  });

  it('denies refund for completed challenge', () => {
    const taskDates = [new Date('2025-06-05')];
    const result = checkOutageRefundEligibility('completed', 100, taskDates, outages);
    expect(result.eligible).toBe(false);
  });

  it('denies refund when no task dates affected by outage', () => {
    const taskDates = [new Date('2025-06-01'), new Date('2025-06-02')];
    const result = checkOutageRefundEligibility('failed', 100, taskDates, outages);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('未受系统故障影响');
  });

  it('denies refund when no outages exist', () => {
    const taskDates = [new Date('2025-06-05')];
    const result = checkOutageRefundEligibility('failed', 100, taskDates, []);
    expect(result.eligible).toBe(false);
  });

  it('refunds the full deposit amount', () => {
    const taskDates = [new Date('2025-06-05')];
    const result = checkOutageRefundEligibility('failed', 200, taskDates, outages);
    expect(result.refundAmount).toBe(200);
  });
});

// --- validateAppeal ---

describe('validateAppeal', () => {
  it('accepts valid appeal', () => {
    const result = validateAppeal('系统故障导致我无法提交记录，请求退款处理', false);
    expect(result.valid).toBe(true);
  });

  it('rejects when existing pending appeal exists', () => {
    const result = validateAppeal('有效的申诉原因，长度足够十个字符以上', true);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('待处理的申诉');
  });

  it('rejects reason shorter than minimum', () => {
    const result = validateAppeal('太短了', false);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain(`${MIN_APPEAL_REASON_LENGTH}`);
  });

  it('rejects empty reason', () => {
    const result = validateAppeal('', false);
    expect(result.valid).toBe(false);
  });

  it('rejects reason exceeding maximum length', () => {
    const longReason = 'a'.repeat(MAX_APPEAL_REASON_LENGTH + 1);
    const result = validateAppeal(longReason, false);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain(`${MAX_APPEAL_REASON_LENGTH}`);
  });

  it('accepts reason at exact minimum length', () => {
    const reason = 'a'.repeat(MIN_APPEAL_REASON_LENGTH);
    const result = validateAppeal(reason, false);
    expect(result.valid).toBe(true);
  });

  it('accepts reason at exact maximum length', () => {
    const reason = 'a'.repeat(MAX_APPEAL_REASON_LENGTH);
    const result = validateAppeal(reason, false);
    expect(result.valid).toBe(true);
  });
});

// --- calculateRefundDeadline ---

describe('calculateRefundDeadline', () => {
  it('adds 3 business days (Mon → Thu)', () => {
    // Monday June 2, 2025
    const approval = new Date('2025-06-02T10:00:00');
    const deadline = calculateRefundDeadline(approval);
    // Mon + 3 business days = Thu June 5
    expect(deadline.getDate()).toBe(5);
    expect(deadline.getMonth()).toBe(5); // June
  });

  it('skips weekends (Thu → Tue)', () => {
    // Thursday June 5, 2025
    const approval = new Date('2025-06-05T10:00:00');
    const deadline = calculateRefundDeadline(approval);
    // Thu + 3 business days = Fri, Mon, Tue → June 10
    expect(deadline.getDate()).toBe(10);
  });

  it('skips weekends (Fri → Wed)', () => {
    // Friday June 6, 2025
    const approval = new Date('2025-06-06T10:00:00');
    const deadline = calculateRefundDeadline(approval);
    // Fri + 3 business days = Mon, Tue, Wed → June 11
    expect(deadline.getDate()).toBe(11);
  });
});

// --- isRefundOverdue ---

describe('isRefundOverdue', () => {
  it('returns false within deadline', () => {
    // Monday approval, check on Tuesday
    const approval = new Date('2025-06-02T10:00:00');
    const now = new Date('2025-06-03T10:00:00');
    expect(isRefundOverdue(approval, now)).toBe(false);
  });

  it('returns true after deadline', () => {
    // Monday approval, deadline is Thursday, check on Friday
    const approval = new Date('2025-06-02T10:00:00');
    const now = new Date('2025-06-06T10:00:00');
    expect(isRefundOverdue(approval, now)).toBe(true);
  });
});

// --- getAppealRefundAmount ---

describe('getAppealRefundAmount', () => {
  it('returns deposit amount for approved appeal', () => {
    expect(getAppealRefundAmount('approved', 100)).toBe(100);
  });

  it('returns 0 for pending appeal', () => {
    expect(getAppealRefundAmount('pending', 100)).toBe(0);
  });

  it('returns 0 for rejected appeal', () => {
    expect(getAppealRefundAmount('rejected', 100)).toBe(0);
  });
});

// --- getAffectedUserIds ---

describe('getAffectedUserIds', () => {
  it('returns users with active challenges during outage', () => {
    const challenges = [
      { userId: 'user-1', startDate: new Date('2025-06-01'), endDate: new Date('2025-06-07') },
      { userId: 'user-2', startDate: new Date('2025-06-10'), endDate: new Date('2025-06-16') },
    ];
    const outageStart = new Date('2025-06-05T10:00:00');
    const outageEnd = new Date('2025-06-05T14:00:00');

    const result = getAffectedUserIds(challenges, outageStart, outageEnd);
    expect(result).toEqual(['user-1']);
  });

  it('returns multiple users when multiple challenges affected', () => {
    const challenges = [
      { userId: 'user-1', startDate: new Date('2025-06-01'), endDate: new Date('2025-06-07') },
      { userId: 'user-2', startDate: new Date('2025-06-03'), endDate: new Date('2025-06-09') },
    ];
    const outageStart = new Date('2025-06-05T10:00:00');
    const outageEnd = new Date('2025-06-05T14:00:00');

    const result = getAffectedUserIds(challenges, outageStart, outageEnd);
    expect(result).toEqual(['user-1', 'user-2']);
  });

  it('returns empty array when no challenges affected', () => {
    const challenges = [
      { userId: 'user-1', startDate: new Date('2025-06-10'), endDate: new Date('2025-06-16') },
    ];
    const outageStart = new Date('2025-06-01T10:00:00');
    const outageEnd = new Date('2025-06-02T10:00:00');

    const result = getAffectedUserIds(challenges, outageStart, outageEnd);
    expect(result).toEqual([]);
  });

  it('handles active outage (null end)', () => {
    const challenges = [
      { userId: 'user-1', startDate: new Date('2025-06-01'), endDate: new Date('2025-06-07') },
    ];
    const outageStart = new Date('2025-06-05T10:00:00');

    const result = getAffectedUserIds(challenges, outageStart, null);
    expect(result).toEqual(['user-1']);
  });

  it('returns empty for empty challenges list', () => {
    const result = getAffectedUserIds([], new Date(), new Date());
    expect(result).toEqual([]);
  });
});
