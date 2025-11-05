import React from "react";
import { View } from "react-native";
import { useIsOrganizer, useIsAttendee } from "../stores/devRole";

/** Show children only when effective role is organizer */
export const OrganizerOnly: React.FC<React.PropsWithChildren> = ({ children }) => {
  const ok = useIsOrganizer();
  if (!ok) return null;
  return <View>{children}</View>;
};

/** Show children only when effective role is attendee */
export const AttendeeOnly: React.FC<React.PropsWithChildren> = ({ children }) => {
  const ok = useIsAttendee();
  if (!ok) return null;
  return <View>{children}</View>;
};

/** Shared is just a passthrough container */
export const Shared: React.FC<React.PropsWithChildren> = ({ children }) => {
  return <View>{children}</View>;
};




