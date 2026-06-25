import React from "react";

export function Button({ children, variant = "primary", className = "", ...props }) {
  return (
    <button className={`ta-button ta-button-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
