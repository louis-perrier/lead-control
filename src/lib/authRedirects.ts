const PROD_AUTH_ORIGIN = "https://leadcontrol.fr";

const sanitizeOrigin = (origin: string) => origin.replace(/\/$/, "");

const isLocalhost = (origin: string) =>
  origin.includes("localhost") || origin.includes("127.0.0.1");

const getAuthRedirectOrigin = () => {
  return PROD_AUTH_ORIGIN;
};

const buildAuthRedirectUrl = (path: string) =>
  `${getAuthRedirectOrigin()}${path}`;

export const getLoginRedirectUrl = () => buildAuthRedirectUrl("/login");
export const getResetPasswordRedirectUrl = () =>
  buildAuthRedirectUrl("/reset-password");
export const getDashboardRedirectUrl = () =>
  buildAuthRedirectUrl("/app");

export default {
  getLoginRedirectUrl,
  getResetPasswordRedirectUrl,
  getDashboardRedirectUrl,
};
