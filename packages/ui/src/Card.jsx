import React from "react";

export function Card({ children, className = "", ...props }) {
  return <section className={`ta-card ${className}`} {...props}>{children}</section>;
}

export function CardTitle({ title, subtitle }) {
  return (
    <div className="ta-card-title">
      <h2>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  );
}
