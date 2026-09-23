// Live local time for [data-clock] elements (Kerala / IST by default).
export function initClock(timeZone = "Asia/Kolkata", seconds = false) {
  const els = document.querySelectorAll<HTMLElement>("[data-clock]");
  if (!els.length) return;
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: seconds ? "2-digit" : undefined });
  const tick = () => els.forEach((el) => (el.textContent = fmt.format(new Date())));
  tick();
  setInterval(tick, 1000);
}
