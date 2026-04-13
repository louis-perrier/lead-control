import { FunctionComponent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import Contacts from "../../pages/Contacts";
import useSubscriptionState from "../../hooks/useSubscriptionState";

const ContactsGuard: FunctionComponent = () => {
  const location = useLocation();
  const { data: subscriptionState, isLoading } = useSubscriptionState();

  if (isLoading) {
    return null;
  }

  if (subscriptionState?.planKey !== "TESTEUR") {
    return <Navigate to="/app" replace state={{ from: location.pathname }} />;
  }

  return <Contacts />;
};

export default ContactsGuard;
