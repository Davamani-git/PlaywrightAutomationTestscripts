import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// --- START: CONSOLE INTERCEPTION SCRIPT ---
const targetOrigin = '*'; // <-- IMPORTANT: SET YOUR PARENT ORIGIN
// const targetOrigin = '*'; // Use '*' ONLY for local development if origins differ

// Store original console methods
const originalConsole = {
    log: console.log.bind(console),
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    info: console.info.bind(console),
};

// Function to format arguments for postMessage
function formatLogArguments(args) {
    // (Keep the function as you defined it)
    return args.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
            try {
                return JSON.parse(JSON.stringify(arg));
            } catch (e) {
                return '[Unserializable Object]';
            }
        }
        return String(arg);
    }).join(' ');
}

// Override console methods
console.log = (...args) => {
    originalConsole.log(...args);
    try {
        window.parent.postMessage({ type: 'console', level: 'log', message: formatLogArguments(args), timestamp: new Date().toISOString() }, targetOrigin);
    } catch (e) { originalConsole.error("Error posting log message:", e); }
};

console.error = (...args) => {
    originalConsole.error(...args);
    try {
        const message = formatLogArguments(args);
        const stack = (args[0] instanceof Error) ? args[0].stack : new Error().stack;
        window.parent.postMessage({ type: 'console', level: 'error', message: message, stack: stack, timestamp: new Date().toISOString() }, targetOrigin);
    } catch (e) { originalConsole.error("Error posting error message:", e); }
};

console.warn = (...args) => {
    originalConsole.warn(...args);
    try {
        window.parent.postMessage({ type: 'console', level: 'warn', message: formatLogArguments(args), timestamp: new Date().toISOString() }, targetOrigin);
    } catch (e) { originalConsole.error("Error posting warn message:", e); }
};

console.info = (...args) => {
    originalConsole.info(...args);
    try {
        window.parent.postMessage({ type: 'console', level: 'info', message: formatLogArguments(args), timestamp: new Date().toISOString() }, targetOrigin);
    } catch (e) { originalConsole.error("Error posting info message:", e); }
};

// Catch unhandled errors and rejections
window.addEventListener('error', (event) => {
    originalConsole.error('Unhandled global error:', event.error || event.message);
    try {
        window.parent.postMessage({ type: 'console', level: 'error', message: `Unhandled global error: ${event.message}`, errorDetails: event.error ? formatLogArguments([event.error]) : null, stack: event.error ? event.error.stack : null, filename: event.filename, lineno: event.lineno, colno: event.colno, timestamp: new Date().toISOString() }, targetOrigin);
    } catch (e) { originalConsole.error("Error posting global error message:", e); }
});

window.addEventListener('unhandledrejection', (event) => {
    originalConsole.error('Unhandled promise rejection:', event.reason);
    try {
        window.parent.postMessage({ type: 'console', level: 'error', message: `Unhandled promise rejection: ${formatLogArguments([event.reason])}`, reason: formatLogArguments([event.reason]), stack: event.reason instanceof Error ? event.reason.stack : null, timestamp: new Date().toISOString() }, targetOrigin);
    } catch (e) { originalConsole.error("Error posting rejection message:", e); }
});

console.log('Console interceptor initialized.');
// --- END: CONSOLE INTERCEPTION SCRIPT ---


const App = () => (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
);

export default App;
