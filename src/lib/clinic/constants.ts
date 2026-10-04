export const CLINIC = {
  name: "Jo-Lin Family Clinic & Surgery",
  slug: "jo-lin-family-clinic",
  location: "Limbang Shopping Centre",
  address: ["533 Choa Chu Kang Street 51", "#02-06", "Singapore 680533"],
  phone: "6760 6014",
  timezone: "Asia/Singapore",
} as const;

export const operatingHours = [
  ["Monday – Friday", "8:30 am – 12:30 pm", "2:00 pm – 4:30 pm"],
  ["Saturday", "8:30 am – 12:30 pm", ""],
  ["Sunday & public holidays", "Closed", ""],
] as const;
