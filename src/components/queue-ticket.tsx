import { Clock3, Users } from "lucide-react";

export function QueueTicket({ number = "A052", serving = "A043", ahead = 9, wait = 45, paused = false, live = true }: { number?: string; serving?: string; ahead?: number; wait?: number | null; paused?: boolean; live?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] bg-[#12372d] p-7 text-white shadow-[0_24px_70px_rgba(18,55,45,.18)] md:p-9">
      <div className="absolute -right-10 -top-10 size-40 rounded-full border-[24px] border-white/5" />
      <div className="relative"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold text-[#bfe9da]">Your number</p><p className="mt-1 font-heading text-7xl font-semibold tracking-tight md:text-8xl">{number}</p></div><span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold">{live ? "Live" : "Example"}</span></div>
        {paused ? <div className="mt-6 rounded-xl bg-[#f1bd64] p-4 font-bold text-[#4c350d]">Clinic queue temporarily paused</div> : <div className="mt-7 grid grid-cols-2 gap-3 border-t border-white/15 pt-6"><div><p className="text-sm text-white/80">Currently serving</p><p className="mt-1 text-3xl font-bold">{serving}</p></div><div><p className="text-sm text-white/80">Patients ahead of you</p><p className="mt-1 flex items-center gap-2 text-3xl font-bold"><Users className="size-5" />{ahead}</p></div></div>}
        <div className="mt-5 flex items-center gap-3 rounded-xl bg-white/8 px-4 py-3"><Clock3 className="size-5 text-[#bfe9da]" /><div><p className="text-sm text-white/80">Estimated wait</p><p className="text-2xl font-bold">{wait === null ? (paused ? "Available when queue resumes" : "No active wait estimate") : `About ${wait} minutes`}</p></div></div>
      </div>
    </div>
  );
}
