import {
  DINNER_CLOCK_TIMES,
  DINNER_CANCEL,
  DINNER_NONE,
  DINNER_PENDING,
} from "../constants/dinnerTime";

export function normalizeDinnerValue(value) {
  if (value === DINNER_PENDING) return DINNER_PENDING;
  if (value === DINNER_NONE) return DINNER_NONE;
  if (value === DINNER_CANCEL) return DINNER_CANCEL;
  if (typeof value === "string" && DINNER_CLOCK_TIMES.includes(value)) {
    return value;
  }
  return DINNER_NONE;
}

export function normalizeDinnerTime(reservation, nights) {
  const source = Array.isArray(reservation?.dinner_time)
    ? reservation.dinner_time
    : (reservation?.dinner_time != null ? [reservation.dinner_time] : []);

  return Array.from({ length: Math.max(0, nights) }, (_, idx) =>
    normalizeDinnerValue(source[idx])
  );
}
