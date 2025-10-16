'use client';
import React from 'react';

type Props = { children: React.ReactNode; fallback?: React.ReactNode };
type State = { hasError: boolean; err?: unknown };

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(err: unknown) { return { hasError: true, err }; }
  componentDidCatch(err: unknown, info: unknown) {
    console.error('Lists ErrorBoundary caught:', err, info);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{padding:16, background:'#3b0d0d', border:'1px solid #7f1d1d', borderRadius:8}}>
          <b>Something went wrong loading this page.</b>
          <div style={{opacity:.8, marginTop:6, fontSize:12}}>Check the browser console for details.</div>
        </div>
      );
    }
    return this.props.children;
  }
}
