export interface LockOffIconProps {
  className?: string;
}

/** Lucide 没有「锁 + 斜杠」这一款，所以自绘：斜线用两层描边在深色栏上开一道缝。 */
export function LockOffIcon({ className }: LockOffIconProps): React.JSX.Element {
  return (
    <svg
      className={className}
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      <line x1="1.3" y1="22.7" x2="21.5" y2="2.5" stroke="var(--chrome)" strokeWidth={5} />
      <line x1="1.8" y1="22.2" x2="21" y2="3" />
    </svg>
  );
}
