import React from 'react';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'Đã xảy ra sự cố hệ thống ngoài dự kiến.',
    };
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#090A0D] text-[#E6E9F0] flex items-center justify-center p-6">
          <div className="max-w-lg w-full border border-red-500/40 bg-[#12151C] p-6 space-y-4">
            <p className="text-xs font-mono text-red-400">Ngắt Kết Nối Hệ Thống</p>
            <h1 className="font-display text-3xl font-bold tracking-tight text-white">
              Phiên Đấu Trường Bị Gián Đoạn
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed break-words">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              Tải lại Đấu trường
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
