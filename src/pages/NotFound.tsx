import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Home, SearchX } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="glass-card glass-hover border-border/50 p-10 md:p-14 text-center max-w-md w-full">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <SearchX className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-6xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
          404
        </h1>
        <p className="mt-2 mb-1 text-lg font-semibold">Page not found</p>
        <p className="mb-6 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or may have moved.
        </p>
        <Link
          to="/"
          className="glass-button glass-hover inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium text-primary"
        >
          <Home className="h-4 w-4" />
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
