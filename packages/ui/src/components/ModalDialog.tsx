import { useEffect, useRef } from "react";
import { TextButton } from "./Icon.tsx";

export interface DialogAction {
  readonly label: string;
  readonly primary?: boolean;
  run: () => void;
}

interface Props {
  readonly title: string;
  readonly children: React.ReactNode;
  readonly actions: readonly DialogAction[];
  onCancel: () => void;
}

export function ModalDialog({ title, children, actions, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-md shadow-lg"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="flex flex-col gap-3 p-4">
        <h2 className="m-0 text-[1.1em] font-semibold">{title}</h2>
        {children}
        <div className="flex flex-wrap justify-end gap-2">
          {actions.map((action) => (
            <TextButton key={action.label} primary={action.primary} onClick={action.run}>
              {action.label}
            </TextButton>
          ))}
        </div>
      </div>
    </dialog>
  );
}
