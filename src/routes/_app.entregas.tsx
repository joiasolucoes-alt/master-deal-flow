import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/entregas")({
  beforeLoad: () => {
    throw redirect({ to: "/fretes", replace: true });
  },
});
