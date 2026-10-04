export type AppRole = "patient" | "receptionist" | "doctor" | "admin";

const routeRoles: Array<{ prefix: string; roles: AppRole[] }> = [
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/doctor", roles: ["doctor", "admin"] },
  { prefix: "/staff", roles: ["receptionist", "doctor", "admin"] },
  { prefix: "/records", roles: ["patient", "doctor", "admin"] },
  { prefix: "/prescriptions", roles: ["patient", "doctor", "admin"] },
  { prefix: "/appointments", roles: ["patient", "receptionist", "doctor", "admin"] },
  { prefix: "/queue", roles: ["patient", "receptionist", "doctor", "admin"] },
];

export function canAccess(role: AppRole, pathname: string) {
  const rule = routeRoles.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return rule ? rule.roles.includes(role) : true;
}
