// The slot grid already presented by BookingForm: 15-minute weekday/Saturday windows.
export const appointmentTimes = ["08:30", "08:45", "09:00", "09:15", "09:30", "09:45", "10:00", "10:15", "10:30", "10:45", "11:00", "11:15"];
export function slotsForDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const day = new Date(`${date}T00:00:00+08:00`);
  if (!Number.isFinite(day.getTime()) || new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Singapore", year:"numeric", month:"2-digit", day:"2-digit" }).format(day) !== date) return [];
  if (new Date(`${date}T12:00:00Z`).getUTCDay() === 0) return [];
  return appointmentTimes.map(time => new Date(`${date}T${time}:00+08:00`).toISOString());
}
export function isAppointmentSlot(value: string) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Singapore", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date(value));
  return slotsForDate(date).includes(new Date(value).toISOString());
}
