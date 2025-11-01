"use client";
import React from "react";

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { error };
  }
  componentDidCatch(error: any, info: any) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] caught:", error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const e = this.state.error;
    return (
      <div style={{ border: "1px solid #f00", padding: 12, borderRadius: 8, background: "#220" }}>
        <b>UI crashed</b>
        <pre style={{ whiteSpace: "pre-wrap" }}>
          {(e?.message || e || "").toString()}
        </pre>
        <div style={{ opacity: 0.7, fontSize: 12 }}>
          Open DevTools → Console for full stack & component trace.
        </div>
      </div>
    );
  }
}
