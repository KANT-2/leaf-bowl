import type { ReactNode } from "react";
import styles from "./StatusFeedback.module.css";

export default function StatusFeedback({
  title,
  children,
  error = false,
}: {
  title: string;
  children?: ReactNode;
  error?: boolean;
}) {
  return (
    <div className={styles.feedback} role={error ? "alert" : "status"}>
      <p className={styles.title}>{title}</p>
      {children}
    </div>
  );
}
