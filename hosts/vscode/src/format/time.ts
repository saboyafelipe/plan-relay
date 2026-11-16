/** "HH:MM" in the machine's local time, for the panel's "Updated at". */
export function hourMinute(d: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
}
