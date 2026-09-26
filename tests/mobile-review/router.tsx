import type { ReactNode } from "react";
export const createFileRoute = () => (options: unknown) => ({ options });
export const Link = ({
  children,
  to,
  params: _,
  activeProps: __,
  activeOptions: ___,
  search: ____,
  ...props
}: {
  children: ReactNode;
  to: string;
  [key: string]: unknown;
}) => (
  <a href={to} {...props}>
    {children}
  </a>
);
export const Outlet = () => null;
export const useNavigate = () => () => undefined;
export const useRouterState = () => "/admin/profiles";
export const redirect = (value: unknown) => value;
