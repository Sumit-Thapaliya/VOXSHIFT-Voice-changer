import { cn } from '@/lib/utils';
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('page-heading', className)}>
      <div>
        <span className="eyebrow">
          <i />
          {eyebrow}
        </span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="page-heading-actions">{children}</div>}
    </div>
  );
}
export function SessionNotice() {
  return (
    <div className="session-notice">
      <span className="session-notice-dot" />
      <p>
        <strong>Your session, your space.</strong> Creations and activity are temporary. Download
        anything you’d like to keep before refreshing.
      </p>
      <span>NO CLOUD STORAGE</span>
    </div>
  );
}
