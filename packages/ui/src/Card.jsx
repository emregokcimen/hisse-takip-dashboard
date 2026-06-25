import React from "react";

export function Card({ children, className = "" }) {
  return <section className={`ta-card ${className}`}>{children}</section>;
}

export function CardTitle({ title, subtitle }) {
  return (
    <div className="ta-card-title">
      <h2>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  );
}
