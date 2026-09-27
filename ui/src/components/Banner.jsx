import React from "react";

export function Banner({ type, message }) {
  return <div className={"banner " + type}>{message}</div>;
}