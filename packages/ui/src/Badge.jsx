import React from "react";

export function Badge({ children, tone = "neutral", className = "" }) {
  return <span className={`ta-badge ta-badge-${tone} ${className}`}>{children}</span>;
}
