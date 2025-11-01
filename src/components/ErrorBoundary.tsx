"use client";
import React from "react";

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: any; info?: { componentStack?: string } }
> {
  constructor(props: any) {
    super(props);
    this.state = { error: null, info: undefined };
  }
  static getDerivedStateFromError(error: any) {
    return { error };
  }
  componentDidCatch(error: any, info: any) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] caught:", error, info);
    this.setState({ info });
  }
  render() {
    if (!this.state.error) return this.props.children;
    const e = this.state.error;
    return (
      <div style={{ border: "1px solid #f00", padding: 12, borderRadius: 8, background: "#220", margin: 8 }}>
        <b>UI crashed</b>
        <pre style={{ whiteSpace: "pre-wrap" }}>{String(e?.message ?? e)}</pre>
        {this.state.info?.componentStack ? (
          <>
            <div style={{ marginTop: 6, opacity: .9 }}>Component stack:</div>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, opacity: .85 }}>
              {this.state.info.componentStack}
            </pre>
          </>
        ) : null}
        <div style={{ opacity: 0.7, fontSize: 12 }}>
          Tip: add <code>?debug=1</code> to the URL for live logs.
        </div>
      </div>
    );
  }
}
