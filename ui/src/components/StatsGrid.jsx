import React from "react";

function Card({ label, value, variant }) {
  return (
    <div className={"card " + variant}>
      <div className="card-label">{label}</div>
      <div className="card-value">{value}</div>
    </div>
  );
}

export function StatsGrid({ queue }) {
  return (
    <div className="stats">
      <Card label="Pending"    value={queue.pending}    variant="pending" />
      <Card label="Processing" value={queue.processing} variant="processing" />
      <Card label="Success"    value={queue.success}    variant="success" />
      <Card label="Failed"     value={queue.failed}     variant="failed" />
    </div>
  );
}