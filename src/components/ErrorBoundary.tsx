import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
}

// Without this, ANY uncaught render error anywhere in the app (a bad date, a cache shape
// mismatch, a null field the code didn't expect) unmounts the entire React tree and leaves a
// blank white screen with zero recovery - exactly what just happened on the Product Category
// page from a React Query cache key collision. This won't prevent bugs from existing, but it
// guarantees a bug can only ever take down the page it's on, with a real "something broke, here's
// how to recover" screen instead of silence - and it logs enough detail (console, for now) that a
// dev can actually diagnose what happened instead of hearing "the app just went blank."
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || "Unknown error" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Caught a render error:", error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-background">
          <div className="max-w-md w-full text-center space-y-4">
            <AlertTriangle className="h-12 w-12 mx-auto text-destructive" />
            <h1 className="text-xl font-bold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              This page hit an unexpected error and couldn't continue. Your data is safe - try
              reloading, or head back to the Dashboard.
            </p>
            {this.state.errorMessage && (
              <p className="text-xs font-mono text-muted-foreground/70 break-words bg-muted/50 rounded-md p-2">
                {this.state.errorMessage}
              </p>
            )}
            <div className="flex gap-2 justify-center pt-2">
              <Button onClick={this.handleReload} className="gap-2">
                <RefreshCcw className="h-4 w-4" />
                Reload
              </Button>
              <Button onClick={this.handleGoHome} variant="outline" className="gap-2">
                <Home className="h-4 w-4" />
                Dashboard
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
