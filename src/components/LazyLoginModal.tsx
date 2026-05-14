import { Suspense, lazy } from "react";

type LazyLoginModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason?: string;
};

const LoginModal = lazy(() =>
  import("./LoginModal").then((module) => ({ default: module.LoginModal })),
);

export function LazyLoginModal(props: LazyLoginModalProps) {
  if (!props.open) return null;

  return (
    <Suspense fallback={null}>
      <LoginModal {...props} />
    </Suspense>
  );
}
